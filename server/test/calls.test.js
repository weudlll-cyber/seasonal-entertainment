// ============================================================
// File:        calls.test.js
// Path:        server/test/calls.test.js
// Project:     Seasonal Entertainment
// Description: Calls management (docs/CALLS.md): only organisers and admins (with 2FA in
//              order) create, start and end calls; status changes scheduled -> live -> ended
//              (or scheduled -> ended), never back; start opens the call service's room with
//              the participant cap, end closes it; the summary's LIVE flag; without a call
//              service the feature is off; every action is audited.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { createCall, markEnded, markLive } from '../src/calls/store.js';
import { callApp, newCall, organiser } from './helpers/calls.js';
import { auditActions, chatApp } from './helpers/chat.js';
import { makeStaff, registerUser, setRole } from './helpers/testApp.js';

let t;
let service;
afterEach(() => t.close());

describe('who may manage calls', () => {
  it('guests, members and staff without 2FA are refused on every management route', async () => {
    ({ t, service } = callApp());
    const call = await newCall(await organiser(t));
    const member = (await registerUser(t, 'mia')).agent;
    const no2fa = await registerUser(t, 'otto');
    setRole(t, no2fa.user.id, 'organiser');
    const routes = [
      (a) => a.post('/api/calls').send({ title: 'x' }),
      (a) => a.post(`/api/calls/${call.id}/start`),
      (a) => a.post(`/api/calls/${call.id}/end`),
    ];
    for (const route of routes) {
      expect((await route(t.client())).status).toBe(401);
      expect((await route(member)).status).toBe(403);
      expect((await route(no2fa.agent)).status).toBe(403);
    }
    expect(service.log).toEqual([]);
    // Nor are they offered the controls.
    expect((await member.get('/api/calls')).body.canManage).toBe(false);
    expect((await no2fa.agent.get('/api/calls')).body.canManage).toBe(false);
  });

  it('organisers and admins may', async () => {
    ({ t, service } = callApp());
    const admin = (await makeStaff(t, 'ada', 'admin')).agent;
    const call = await newCall(admin, 'By the admin');
    expect((await admin.post(`/api/calls/${call.id}/start`)).status).toBe(200);
    expect((await (await organiser(t)).post(`/api/calls/${call.id}/end`)).status).toBe(200);
    expect(auditActions(t)).toEqual(['call.create', 'call.start', 'call.end']);
  });
});

describe('status changes', () => {
  it('scheduled -> live -> ended, opening and closing the room with the cap', async () => {
    ({ t, service } = callApp());
    const agent = await organiser(t);
    const call = await newCall(agent);
    expect(call).toMatchObject({
      status: 'scheduled',
      createdBy: 'olga',
      chatRoom: `call-${call.id}`,
    });
    expect(call.roomName).toBeUndefined();

    const started = await agent.post(`/api/calls/${call.id}/start`);
    expect(started.body.call).toMatchObject({ status: 'live' });
    expect(started.body.call.startedAt).toBeTruthy();
    const [[action, room, cap]] = service.log;
    expect([action, cap]).toEqual(['open', 250]);
    expect(room).toMatch(/^call-[0-9a-f]{16}$/);
    expect((await agent.post(`/api/calls/${call.id}/start`)).status).toBe(409);

    const ended = await agent.post(`/api/calls/${call.id}/end`);
    expect(ended.body.call).toMatchObject({ status: 'ended' });
    expect(service.log.at(-1)).toEqual(['close', room]);
    expect((await agent.post(`/api/calls/${call.id}/end`)).status).toBe(409);
    expect((await agent.post(`/api/calls/${call.id}/start`)).status).toBe(409);
    // A refused start never opens a room on the call service.
    expect(service.log.filter(([kind]) => kind === 'open')).toHaveLength(1);
  });

  it('each change applies only from the expected status (two organisers at once)', () => {
    ({ t, service } = callApp());
    const id = createCall(t.db, { title: 'Race' }, null);
    expect(markLive(t.db, id)).toBe(true);
    expect(markLive(t.db, id)).toBe(false);
    expect(markEnded(t.db, id)).toBe(true);
    expect(markEnded(t.db, id)).toBe(false);
    expect(markLive(t.db, id)).toBe(false);
  });

  it('a scheduled call can be ended without going live (cancelled)', async () => {
    ({ t, service } = callApp());
    const agent = await organiser(t);
    const call = await newCall(agent);
    expect((await agent.post(`/api/calls/${call.id}/end`)).body.call.status).toBe('ended');
  });

  it('the participant cap comes from the admin setting', async () => {
    ({ t, service } = callApp());
    const admin = (await makeStaff(t, 'ada', 'admin')).agent;
    await admin.put('/api/admin/settings/calls.maxParticipants').send({ value: 120 });
    const call = await newCall(admin);
    await admin.post(`/api/calls/${call.id}/start`);
    expect(service.log[0][2]).toBe(120);
  });
});

describe('listing and the LIVE flag', () => {
  it('lists live, upcoming and recent calls; the summary says when one is live', async () => {
    ({ t, service } = callApp());
    const agent = await organiser(t);
    const [a, b, c] = [
      await newCall(agent, 'A'),
      await newCall(agent, 'B'),
      await newCall(agent, 'C'),
    ];
    await agent.post(`/api/calls/${a.id}/start`);
    await agent.post(`/api/calls/${c.id}/end`);
    const guest = t.client();
    expect((await guest.get('/api/calls/summary')).body).toMatchObject({
      configured: true,
      live: true,
    });
    const { calls, canManage } = (await guest.get('/api/calls')).body;
    expect(canManage).toBe(false);
    expect(calls.live.map((x) => x.title)).toEqual(['A']);
    expect(calls.upcoming.map((x) => x.title)).toEqual(['B']);
    expect(calls.recent.map((x) => x.title)).toEqual(['C']);
    expect((await guest.get(`/api/calls/${b.id}`)).body.call.title).toBe('B');

    await agent.post(`/api/calls/${a.id}/end`);
    expect((await guest.get('/api/calls/summary')).body.live).toBe(false);
    expect((await agent.get('/api/calls')).body.canManage).toBe(true);
  });

  it('without a call service the feature is off', async () => {
    t = chatApp();
    const agent = (await makeStaff(t, 'olga', 'organiser')).agent;
    expect((await agent.get('/api/calls/summary')).body).toMatchObject({
      configured: false,
      live: false,
    });
    expect((await agent.get('/api/calls')).body).toMatchObject({ configured: false });
    expect((await agent.post('/api/calls').send({ title: 'x' })).status).toBe(503);
  });
});
