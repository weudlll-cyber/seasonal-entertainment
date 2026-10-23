// ============================================================
// File:        settings.test.js
// Path:        server/test/settings.test.js
// Project:     Seasonal Entertainment
// Description: Admin-editable site settings (settings/): only admins read and change them;
//              defaults until changed, in their groups; values outside a setting's range and
//              unknown keys are refused; every change is audited with the old and new value and
//              takes effect at the next use, without a restart.
// ============================================================

import { afterEach, expect, it } from 'vitest';
import { SETTINGS } from '../src/settings/definitions.js';
import { getSetting } from '../src/settings/store.js';
import { auditActions } from './helpers/chat.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t.close());

const valueOf = (settings, key) => settings.find((s) => s.key === key).value;

it('admins read the defaults and change a setting within its range', async () => {
  t = makeTestApp();
  const admin = (await makeStaff(t, 'ada', 'admin')).agent;
  const { groups, settings } = (await admin.get('/api/admin/settings')).body;
  expect(groups[0]).toBe('Chat');
  expect(settings.find((s) => s.key === 'calls.maxSpeakers')).toMatchObject({
    group: 'Calls',
    type: 'integer',
    unit: 'speakers',
    min: 1,
    max: 25,
  });
  expect(valueOf(settings, 'calls.maxSpeakers')).toBe(10);
  expect(valueOf(settings, 'calls.maxParticipants')).toBe(250);

  const changed = await admin.put('/api/admin/settings/calls.maxSpeakers').send({ value: 6 });
  expect(valueOf(changed.body.settings, 'calls.maxSpeakers')).toBe(6);
  expect(auditActions(t)).toEqual(['setting.change']);
  const entry = t.db.prepare('SELECT before, after FROM audit_log').get();
  expect([JSON.parse(entry.before), JSON.parse(entry.after)]).toEqual([
    { value: 10 },
    { value: 6 },
  ]);
});

it('a change takes effect at the next use, without a restart', async () => {
  t = makeTestApp();
  const admin = (await makeStaff(t, 'ada', 'admin')).agent;
  expect(getSetting(t.db, 'calls.maxSpeakers')).toBe(10); // read once: now kept in memory
  await admin.put('/api/admin/settings/calls.maxSpeakers').send({ value: 4 });
  expect(getSetting(t.db, 'calls.maxSpeakers')).toBe(4);
});

it('refuses values outside the range and unknown keys', async () => {
  t = makeTestApp();
  const admin = (await makeStaff(t, 'ada', 'admin')).agent;
  const put = (key, value) => admin.put(`/api/admin/settings/${key}`).send({ value });
  expect((await put('calls.maxSpeakers', 0)).status).toBe(400);
  expect((await put('calls.maxSpeakers', 26)).status).toBe(400);
  expect((await put('calls.maxSpeakers', 2.5)).status).toBe(400);
  expect((await put('calls.maxParticipants', '200')).status).toBe(400);
  expect((await put('calls.nope', 3)).status).toBe(404);
  expect(auditActions(t)).toEqual([]);
});

it('every setting keeps to its bounds: whole numbers from min to max, on/off as true or false', async () => {
  t = makeTestApp();
  const admin = (await makeStaff(t, 'ada', 'admin')).agent;
  const put = async (key, value) =>
    (await admin.put(`/api/admin/settings/${key}`).send({ value })).status;
  for (const [key, definition] of Object.entries(SETTINGS)) {
    expect(definition.help, key).toBeTruthy(); // every setting explains itself on the page
    if (definition.type === 'integer') {
      expect([await put(key, definition.min), await put(key, definition.max)], key).toEqual([
        200, 200,
      ]);
      expect([await put(key, definition.min - 1), await put(key, definition.max + 1)], key).toEqual(
        [400, 400]
      );
    }
    if (definition.type === 'boolean') {
      expect([await put(key, false), await put(key, true), await put(key, 'off')], key).toEqual([
        200, 200, 400,
      ]);
    }
  }
});

it('is for admins only', async () => {
  t = makeTestApp();
  const organiser = (await makeStaff(t, 'olga', 'organiser')).agent;
  const member = (await registerUser(t, 'mia')).agent;
  for (const agent of [organiser, member, t.client()]) {
    expect((await agent.get('/api/admin/settings')).status).toBeGreaterThanOrEqual(401);
    const put = await agent.put('/api/admin/settings/calls.maxSpeakers').send({ value: 3 });
    expect([401, 403]).toContain(put.status);
  }
});
