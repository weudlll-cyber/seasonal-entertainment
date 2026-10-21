// ============================================================
// File:        callReminders.test.js
// Path:        server/test/callReminders.test.js
// Project:     Seasonal Entertainment
// Description: Around a planned call (docs/CALLS.md): the calendar file for everyone (RFC 5545
//              content, escaping, folding; only a call still to come with a time); a member's
//              reminder stored, listed, removed by the member and by the call's end, refused
//              to guests; the notices "soon" (10 minutes before) and "live" reaching every open
//              page of the member once per kind — not again in a later round, nor after a
//              restart, and not to another member.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { callCalendar, escapeText } from '../src/calls/calendar.js';
import { sendCallReminders } from '../src/calls/reminders.js';
import { CHAT_SOCKET_PATH } from '../src/chat/socket.js';
import { callApp, newCall, organiser } from './helpers/calls.js';
import { connect, cookieOf, stopServer } from './helpers/chatSocket.js';
import { registerUser } from './helpers/testApp.js';

let t;
let server;
let sockets = [];
afterEach(async () => {
  // Closed before the database: the hub hears each close (the online count).
  sockets.forEach((page) => page.ws.close());
  await Promise.all(sockets.map((page) => page.closed));
  sockets = [];
  await stopServer(server);
  server = null;
  t?.close();
});

const IN_5_MIN = () => new Date(Date.now() + 5 * 60_000).toISOString();

async function plannedCall(agent, title, scheduledFor, description = '') {
  const res = await agent.post('/api/calls').send({ title, scheduledFor, description });
  return res.body.call;
}

describe('calendar file', () => {
  it('is RFC 5545: stable UID, UTC times, an hour long, escaped text, a 15-minute alarm', () => {
    const call = {
      id: 7,
      title: 'Q&A; seasons, tokens',
      description: 'Line one\nback\\slash',
      scheduledFor: '2026-10-22T18:30:00.000Z',
    };
    const text = callCalendar(call, 'https://se.example', new Date('2026-10-21T08:00:00Z'));
    const lines = text.split('\r\n');
    expect(text.endsWith('\r\n')).toBe(true);
    expect(lines).toContain('UID:call-7@se.example');
    expect(lines).toContain('DTSTAMP:20261021T080000Z');
    expect(lines).toContain('DTSTART:20261022T183000Z');
    expect(lines).toContain('DTEND:20261022T193000Z');
    expect(lines).toContain('SUMMARY:Q&A\\; seasons\\, tokens');
    expect(lines).toContain('DESCRIPTION:Line one\\nback\\\\slash\\n\\nhttps://se.example/calls/7');
    expect(text).toMatch(/BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\n/);
    expect(escapeText('a,b;c\\d\r\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('folds lines longer than 75 octets', () => {
    const call = { id: 1, title: 'ä'.repeat(60), description: '', scheduledFor: IN_5_MIN() };
    for (const line of callCalendar(call, 'https://se.example').split('\r\n')) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
    expect(callCalendar(call, 'https://se.example')).toContain('\r\n ');
  });

  it('downloads for guests, for a planned call only', async () => {
    ({ t } = callApp());
    const olga = await organiser(t);
    const call = await plannedCall(olga, 'Town hall', '2026-12-01T19:00:00.000Z');
    const res = await t.client().get(`/api/calls/${call.id}/calendar.ics`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename=seasonal-call-${call.id}.ics`
    );
    expect(res.text).toContain(`DESCRIPTION:http://se.test/calls/${call.id}`);
    const unplanned = await newCall(olga, 'Some time');
    expect((await t.client().get(`/api/calls/${unplanned.id}/calendar.ics`)).status).toBe(409);
  });
});

describe('reminders', () => {
  it('a member sets and removes one; guests cannot; the end of the call removes it', async () => {
    ({ t } = callApp());
    const olga = await organiser(t);
    const call = await plannedCall(olga, 'Town hall', IN_5_MIN());
    const { agent: mia } = await registerUser(t, 'mia');
    const reminded = async () => (await mia.get('/api/calls')).body.reminders;

    expect((await t.client().put(`/api/calls/${call.id}/reminder`)).status).toBe(401);
    expect((await mia.put(`/api/calls/${call.id}/reminder`)).status).toBe(200);
    expect(await reminded()).toEqual([call.id]);
    expect((await mia.delete(`/api/calls/${call.id}/reminder`)).status).toBe(200);
    expect(await reminded()).toEqual([]);

    await mia.put(`/api/calls/${call.id}/reminder`);
    await olga.post(`/api/calls/${call.id}/end`);
    expect(await reminded()).toEqual([]);
    expect((await mia.put(`/api/calls/${call.id}/reminder`)).status).toBe(410);
  });
});

describe('notices', () => {
  async function listening() {
    ({ t } = callApp());
    server = t.app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.app.locals.chat.attach(server);
    return `ws://127.0.0.1:${server.address().port}${CHAT_SOCKET_PATH}`;
  }
  const open = (url, agent) => {
    const page = connect(url, { cookie: cookieOf(agent) });
    sockets.push(page);
    return page;
  };
  const remindersOf = (page) => page.events.filter((e) => e.type === 'callReminder');
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

  it('"soon" and "live" reach every open page once per kind, not again after a restart', async () => {
    const url = await listening();
    const olga = await organiser(t);
    const call = await plannedCall(olga, 'Town hall', IN_5_MIN());
    const { agent: mia } = await registerUser(t, 'mia');
    const { agent: ben } = await registerUser(t, 'ben');
    await mia.put(`/api/calls/${call.id}/reminder`);
    const pages = [open(url, mia), open(url, mia)];
    const other = open(url, ben);
    await Promise.all([...pages, other].map((p) => p.opened));
    const notify = t.app.locals.chat.notify.member;

    expect(sendCallReminders(t.db, notify)).toBe(1);
    expect(sendCallReminders(t.db, notify)).toBe(0); // the next round: already delivered
    await olga.post(`/api/calls/${call.id}/start`); // a round runs at once
    await settle();
    // As after a restart: the delivered marks are in the database.
    expect(sendCallReminders(t.db, notify)).toBe(0);

    for (const page of pages) {
      expect(remindersOf(page).map((e) => [e.kind, e.call.id, e.call.title])).toEqual([
        ['soon', call.id, 'Town hall'],
        ['live', call.id, 'Town hall'],
      ]);
    }
    expect(remindersOf(other)).toEqual([]);
  });

  it('a notice nobody received stays due until a page is open', async () => {
    const url = await listening();
    const olga = await organiser(t);
    const call = await plannedCall(olga, 'Town hall', IN_5_MIN());
    const { agent: mia } = await registerUser(t, 'mia');
    await mia.put(`/api/calls/${call.id}/reminder`);
    const notify = t.app.locals.chat.notify.member;
    expect(sendCallReminders(t.db, notify)).toBe(0); // no page open
    const page = open(url, mia);
    await page.opened;
    expect(sendCallReminders(t.db, notify)).toBe(1);
    await settle();
    expect(remindersOf(page).map((e) => e.kind)).toEqual(['soon']);
  });

  it('nothing before the last 10 minutes', async () => {
    await listening();
    const olga = await organiser(t);
    const later = new Date(Date.now() + 30 * 60_000).toISOString();
    const call = await plannedCall(olga, 'Later', later);
    const { agent: mia } = await registerUser(t, 'mia');
    await mia.put(`/api/calls/${call.id}/reminder`);
    expect(sendCallReminders(t.db, () => 1)).toBe(0);
    expect(sendCallReminders(t.db, () => 1, Date.now() + 21 * 60_000)).toBe(1);
  });
});
