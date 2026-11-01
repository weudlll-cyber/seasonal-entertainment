// ============================================================
// File:        bannerSettings.test.js
// Path:        server/test/bannerSettings.test.js
// Project:     Seasonal Entertainment
// Description: Organisers set the site banner (/api/banner, settings/bannerRoutes.js): they
//              read the "Site banner" settings and change its on/off and text, audited as on
//              Admin → Settings and in effect at once, with the same rules; not its link or
//              style, no other setting, not the admin route; members, guests and organisers
//              without 2FA not at all.
// ============================================================

import { afterEach, expect, it } from 'vitest';
import { ORGANISER_BANNER_KEYS } from '../src/settings/bannerRoutes.js';
import { getSetting } from '../src/settings/store.js';
import { auditActions } from './helpers/chat.js';
import { makeStaff, makeTestApp, registerUser, setRole } from './helpers/testApp.js';

let t;
afterEach(() => t.close());

const BANNER_KEYS = ['banner.enabled', 'banner.text', 'banner.link', 'banner.style'];
const audit = () =>
  t.db
    .prepare('SELECT action, target_type, target_id, before, after FROM audit_log ORDER BY id')
    .all()
    .map((row) => ({ ...row, before: JSON.parse(row.before), after: JSON.parse(row.after) }));

it('an organiser reads the banner settings, and only those', async () => {
  t = makeTestApp();
  const organiser = (await makeStaff(t, 'olga', 'organiser')).agent;
  const res = await organiser.get('/api/banner');
  expect(res.status).toBe(200);
  expect(res.body.settings.map((s) => s.key)).toEqual(BANNER_KEYS);
  expect(res.body.editable).toEqual(['banner.enabled', 'banner.text']);
  expect(ORGANISER_BANNER_KEYS).toEqual(res.body.editable);
  expect(res.body.settings.find((s) => s.key === 'banner.text')).toMatchObject({
    type: 'text',
    maxLength: 200,
    value: '',
  });
});

it('an organiser changes the banner: audited like an admin change, in effect at once', async () => {
  t = makeTestApp();
  const { agent: organiser, user } = await makeStaff(t, 'olga', 'organiser');
  expect(getSetting(t.db, 'banner.text')).toBe(''); // read once: now kept in memory
  const res = await organiser.put('/api/banner').send({
    values: { 'banner.text': 'Call tonight at 8', 'banner.enabled': true },
  });
  expect(res.status).toBe(200);
  expect(Object.fromEntries(res.body.settings.map((s) => [s.key, s.value]))).toMatchObject({
    'banner.text': 'Call tonight at 8',
    'banner.enabled': true,
  });
  expect(getSetting(t.db, 'banner.text')).toBe('Call tonight at 8');
  // Every visitor's browser gets it with the next session answer.
  expect((await t.client().get('/api/auth/session')).body.settings).toMatchObject({
    'banner.text': 'Call tonight at 8',
    'banner.enabled': true,
  });
  expect(audit()).toEqual([
    {
      action: 'setting.change',
      target_type: 'setting',
      target_id: 'banner.text',
      before: { value: '' },
      after: { value: 'Call tonight at 8' },
    },
    {
      action: 'setting.change',
      target_type: 'setting',
      target_id: 'banner.enabled',
      before: { value: false },
      after: { value: true },
    },
  ]);
  const actor = t.db.prepare('SELECT actor_id FROM audit_log').all();
  expect(actor.every((row) => row.actor_id === user.id)).toBe(true);
});

it("an organiser cannot change the banner's link or style, alone or with on/off and text", async () => {
  t = makeTestApp();
  const organiser = (await makeStaff(t, 'olga', 'organiser')).agent;
  const put = async (values) => (await organiser.put('/api/banner').send({ values })).status;
  for (const [key, value] of [
    ['banner.link', '/calls'],
    ['banner.style', 'warning'],
  ]) {
    expect(await put({ [key]: value }), key).toBe(403);
    expect(await put({ 'banner.text': 'allowed', [key]: value }), key).toBe(403);
    expect(await put({ 'banner.enabled': true, [key]: value }), key).toBe(403);
  }
  expect([
    getSetting(t.db, 'banner.link'),
    getSetting(t.db, 'banner.style'),
    getSetting(t.db, 'banner.text'),
    getSetting(t.db, 'banner.enabled'),
  ]).toEqual(['', 'info', '', false]);
  expect(auditActions(t)).toEqual([]);
});

it('the same rules as for admins; one bad value stores none of them', async () => {
  t = makeTestApp();
  const organiser = (await makeStaff(t, 'olga', 'organiser')).agent;
  const put = async (values) => (await organiser.put('/api/banner').send({ values })).status;
  expect(await put({ 'banner.text': 'x'.repeat(201) })).toBe(400);
  expect(await put({ 'banner.text': 'two\nlines' })).toBe(400);
  expect(await put({ 'banner.enabled': 'on' })).toBe(400);
  expect(await put({ 'banner.enabled': true, 'banner.text': 'x'.repeat(201) })).toBe(400);
  expect(await put({})).toBe(400);
  expect((await organiser.put('/api/banner').send({ values: 'x' })).status).toBe(400);
  expect(getSetting(t.db, 'banner.enabled')).toBe(false);
  expect(auditActions(t)).toEqual([]);
});

it('an organiser changes no other setting, neither here nor on the admin route', async () => {
  t = makeTestApp();
  const organiser = (await makeStaff(t, 'olga', 'organiser')).agent;
  const others = {
    'calls.maxSpeakers': 3,
    'chat.uploads': false,
    'accounts.registrationOpen': false,
    'accounts.require2faAll': true,
    'recap.enabled': false,
  };
  for (const [key, value] of Object.entries(others)) {
    const before = getSetting(t.db, key);
    const here = await organiser.put('/api/banner').send({ values: { [key]: value } });
    expect(here.status, key).toBe(403);
    // Together with a banner key: refused as a whole, the banner key not stored either.
    const mixed = await organiser
      .put('/api/banner')
      .send({ values: { 'banner.text': 'sneaky', [key]: value } });
    expect(mixed.status, key).toBe(403);
    const admin = await organiser.put(`/api/admin/settings/${key}`).send({ value });
    expect(admin.status, key).toBe(403);
    expect(getSetting(t.db, key), key).toBe(before);
  }
  expect((await organiser.put('/api/admin/settings/banner.text').send({ value: 'x' })).status).toBe(
    403
  );
  expect((await organiser.get('/api/admin/settings')).status).toBe(403);
  expect(getSetting(t.db, 'banner.text')).toBe('');
  expect(auditActions(t)).toEqual([]);
});

it('members, guests and organisers without 2FA cannot', async () => {
  t = makeTestApp();
  const { agent: member } = await registerUser(t, 'mia');
  const { agent: fresh, user: freshUser } = await registerUser(t, 'otto');
  setRole(t, freshUser.id, 'organiser'); // an organiser who has not set up 2FA yet
  const change = { values: { 'banner.text': 'not allowed' } };
  expect((await member.get('/api/banner')).status).toBe(403);
  expect((await member.put('/api/banner').send(change)).status).toBe(403);
  expect((await t.client().get('/api/banner')).status).toBe(401);
  expect((await t.client().put('/api/banner').send(change)).status).toBe(401);
  const no2fa = await fresh.put('/api/banner').send(change);
  expect([no2fa.status, no2fa.body.error]).toEqual([403, 'two_factor_required']);
  expect((await fresh.get('/api/banner')).body.error).toBe('two_factor_required');
  expect(getSetting(t.db, 'banner.text')).toBe('');
  expect(auditActions(t)).toEqual([]);
});

it('admins may use it too, for the same two settings (the rest on Admin → Settings)', async () => {
  t = makeTestApp();
  const admin = (await makeStaff(t, 'ada', 'admin')).agent;
  const res = await admin.put('/api/banner').send({ values: { 'banner.text': 'From an admin' } });
  expect(res.status).toBe(200);
  const link = await admin.put('/api/banner').send({ values: { 'banner.link': '/calls' } });
  expect(link.status).toBe(403);
  expect(auditActions(t)).toEqual(['setting.change']);
});
