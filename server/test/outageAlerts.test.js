// ============================================================
// File:        outageAlerts.test.js
// Path:        server/test/outageAlerts.test.js
// Project:     Seasonal Entertainment
// Description: The outage e-mails on the site's side (alerts/, settings/groups/alerts.js;
//              docs/DEPLOYMENT.md, "An e-mail when the site is down"): the "Outage alert
//              address" setting takes one plain address or nothing and is written into the file
//              the host's watchdog reads, also when the app starts; "Send a test e-mail" is for
//              admins only, needs a saved address, writes the request for the watchdog and is
//              audited; the watchdog's answer shows only for the newest request.
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setSetting } from '../src/settings/store.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const dataFile = (name) => path.join(path.dirname(t.config.databasePath), name);
const address = () => readFileSync(dataFile('outage-alert-address'), 'utf8');
const save = (agent, value) =>
  agent.put('/api/admin/settings/alerts.outageAddress').send({ value });

describe('the "Outage alert address" setting', () => {
  it('is in the Alerts group, empty by default; the file follows every change', async () => {
    t = makeTestApp();
    const { agent: ada } = await makeStaff(t, 'ada', 'admin');
    const listed = (await ada.get('/api/admin/settings')).body;
    expect(listed.groups).toContain('Alerts');
    expect(listed.settings.find((s) => s.key === 'alerts.outageAddress')).toMatchObject({
      group: 'Alerts',
      value: '',
    });
    expect(address()).toBe('');

    expect((await save(ada, 'ops@example.org')).status).toBe(200);
    expect(address()).toBe('ops@example.org\n');
    expect((await save(ada, '')).status).toBe(200);
    expect(address()).toBe('');
  });

  it.each([
    'two@example.org, three@example.org',
    'Ops <ops@example.org>',
    'ops@example.org\nBcc: x@example.org',
    'no-at-sign',
    'ops@localhost',
  ])('refuses %j, and the file stays', async (value) => {
    t = makeTestApp();
    const { agent: ada } = await makeStaff(t, 'ada', 'admin');
    await save(ada, 'ops@example.org');
    expect((await save(ada, value)).status).toBe(400);
    expect(address()).toBe('ops@example.org\n');
  });

  it('a start writes the stored address (a restored database is followed at once)', () => {
    t = makeTestApp();
    setSetting(t.db, 'alerts.outageAddress', 'restored@example.org');
    expect(address()).toBe('');
    // A second start on the same database (its own other folders; closed at once).
    makeTestApp({ databasePath: t.config.databasePath }).close();
    expect(address()).toBe('restored@example.org\n');
  });
});

describe('"Send a test e-mail"', () => {
  it('admins only; needs a saved address; asks the watchdog and is audited', async () => {
    t = makeTestApp();
    const { agent: mia } = await registerUser(t, 'mia');
    const { agent: ada } = await makeStaff(t, 'ada', 'admin');
    expect((await mia.post('/api/admin/outage-alert/test')).status).toBe(403);
    expect((await t.client().post('/api/admin/outage-alert/test')).status).toBe(401);
    const none = await ada.post('/api/admin/outage-alert/test');
    expect(none.status).toBe(400);
    expect(none.body.message).toBe('Save an outage alert address first.');

    await save(ada, 'ops@example.org');
    const asked = await ada.post('/api/admin/outage-alert/test');
    expect(asked.status).toBe(200);
    expect(readFileSync(dataFile('outage-test-request'), 'utf8')).toBe(
      `${asked.body.requestedAt}\n`
    );
    expect(asked.body.test).toEqual({ requestedAt: asked.body.requestedAt, result: null });
    const audit = t.db
      .prepare("SELECT action FROM audit_log WHERE action = 'alerts.test_mail'")
      .all();
    expect(audit).toHaveLength(1);
  });

  it('shows the watchdog’s answer for the newest request only', async () => {
    t = makeTestApp();
    const { agent: ada } = await makeStaff(t, 'ada', 'admin');
    await save(ada, 'ops@example.org');
    const first = (await ada.post('/api/admin/outage-alert/test')).body.requestedAt;
    writeFileSync(dataFile('outage-test-result'), `sent ${first} 2026-11-14T20:01:00Z\n`);
    expect((await ada.get('/api/admin/outage-alert')).body.test.result).toEqual({
      sent: true,
      at: '2026-11-14T20:01:00Z',
      reason: null,
    });
    writeFileSync(
      dataFile('outage-test-result'),
      `failed ${first} 2026-11-14T20:01:00Z the server said no\n`
    );
    expect((await ada.get('/api/admin/outage-alert')).body.test.result).toEqual({
      sent: false,
      at: '2026-11-14T20:01:00Z',
      reason: 'the server said no',
    });
    // A newer request: the older answer no longer counts.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await ada.post('/api/admin/outage-alert/test');
    expect((await ada.get('/api/admin/outage-alert')).body.test.result).toBeNull();
  });
});
