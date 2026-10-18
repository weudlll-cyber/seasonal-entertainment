// ============================================================
// File:        events.test.js
// Path:        server/test/events.test.js
// Project:     Seasonal Entertainment
// Description: Guards events: inactive events hidden from the public, the editor for admins
//              only, every change audited with what changed, input validation, and the
//              first-start schedule.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { SEED_EVENTS, seedEvents } from '../src/events/seed.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const battle = {
  title: 'Monday Battles',
  description: '',
  rule: 'weekly',
  weekday: 1,
  timeUtc: '21:00',
  durationMinutes: 60,
  channel: 'Discord: Seasonal Tokens server',
  link: 'https://discord.gg/seasonaltokens',
  active: true,
};

const auditRows = () =>
  t.db.prepare('SELECT action, before, after FROM audit_log ORDER BY id').all();

describe('public list', () => {
  it('shows active events and hides inactive ones', async () => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    const { event } = (await agent.post('/api/admin/events').send(battle)).body;
    expect((await t.client().get('/api/events')).body.events).toEqual([
      expect.objectContaining({ title: 'Monday Battles', weekday: 1, timeUtc: '21:00' }),
    ]);
    await agent.put(`/api/admin/events/${event.id}`).send({ ...battle, active: false });
    expect((await t.client().get('/api/events')).body.events).toEqual([]);
    expect((await agent.get('/api/admin/events')).body.events[0].active).toBe(false);
  });
});

describe('editor', () => {
  it('is for admins only', async () => {
    t = makeTestApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    for (const agent of [member, organiser]) {
      expect((await agent.post('/api/admin/events').send(battle)).status).toBe(403);
    }
    expect((await t.client().get('/api/admin/events')).status).toBe(401);
  });

  it('audits create, edit (with what changed) and delete', async () => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    const { event } = (await agent.post('/api/admin/events').send(battle)).body;
    await agent.put(`/api/admin/events/${event.id}`).send({ ...battle, timeUtc: '20:00' });
    expect((await agent.delete(`/api/admin/events/${event.id}`)).status).toBe(200);
    const rows = auditRows();
    expect(rows.map((r) => r.action)).toEqual(['event.create', 'event.edit', 'event.delete']);
    expect(JSON.parse(rows[1].before)).toEqual({ timeUtc: '21:00' });
    expect(JSON.parse(rows[1].after)).toEqual({ timeUtc: '20:00' });
    expect((await t.client().get('/api/events')).body.events).toEqual([]);
  });

  it.each([
    ['a time that is not HH:MM', { timeUtc: '9pm' }],
    ['weekday 0', { weekday: 0 }],
    ['an unknown rule', { rule: 'daily' }],
    ['a non-https link', { link: 'javascript:alert(1)' }],
  ])('refuses %s without an audit entry', async (_label, bad) => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    expect((await agent.post('/api/admin/events').send({ ...battle, ...bad })).status).toBe(400);
    expect(auditRows()).toEqual([]);
  });
});

describe('first-start schedule', () => {
  it('seeds the 14 events once, all active, with Guess the Number on the first Thursday', async () => {
    t = makeTestApp();
    expect(seedEvents(t.db)).toBe(14);
    expect(seedEvents(t.db)).toBe(0);
    const events = (await t.client().get('/api/events')).body.events;
    expect(events).toHaveLength(SEED_EVENTS.length);
    expect(events.find((e) => e.title === 'Guess the Number')).toMatchObject({
      rule: 'monthly_first',
      weekday: 4,
      timeUtc: '19:00',
    });
    expect(events.filter((e) => e.rule === 'weekly')).toHaveLength(13);
  });
});
