// ============================================================
// File:        settingsCallsAccounts.test.js
// Path:        server/test/settingsCallsAccounts.test.js
// Project:     Seasonal Entertainment
// Description: The "Calls" and "Accounts" site settings take effect: recording switched off
//              refuses a new recording and hides the button, while a running one can still be
//              stopped; the reminder's lead time decides when "soon" is sent; registration
//              closed refuses new accounts but not the first admin's bootstrap; 2FA for every
//              member makes a member without it a guest outside the account and 2FA routes,
//              with member routes saying why, until 2FA is on (staff unchanged). The public
//              settings travel with the session answer.
// ============================================================

import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { PUBLIC_SETTING_DEFAULTS } from '@seasonal-entertainment/shared/siteSettings.js';
import { sendCallReminders } from '../src/calls/reminders.js';
import { setSetting } from '../src/settings/store.js';
import { sealSecret } from '../src/twofa/secretBox.js';
import { keysFor, registration } from './helpers/accountKeys.js';
import { callApp, liveCall, organiser, recordingApp } from './helpers/calls.js';
import { chatApp } from './helpers/chat.js';
import { STAFF_TOTP_SECRET, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
let dir;
afterEach(() => {
  t?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('calls', () => {
  it('"Recording allowed" off: no new recording and no button; a running one still stops', async () => {
    ({ t, dir } = recordingApp());
    const olga = await organiser(t);
    const call = await liveCall(olga, 'Town hall');
    const start = () => olga.post(`/api/calls/${call.id}/recording/start`);
    const button = async () => (await olga.get(`/api/calls/${call.id}`)).body.recordingEnabled;

    expect((await start()).status).toBe(200); // allowed by default
    setSetting(t.db, 'calls.recording', false);
    expect(await button()).toBe(true); // the running one can be stopped
    expect((await olga.post(`/api/calls/${call.id}/recording/stop`)).status).toBe(200);
    expect(await button()).toBe(false);
    const refused = await start();
    expect([refused.status, refused.body.message]).toEqual([
      403,
      'Recording is switched off at the moment.',
    ]);
  });

  it('"Reminder before a call" decides how early "soon" is sent', async () => {
    ({ t } = callApp());
    const olga = await organiser(t);
    const in20 = new Date(Date.now() + 20 * 60_000).toISOString();
    const call = (await olga.post('/api/calls').send({ title: 'Later', scheduledFor: in20 })).body
      .call;
    const { agent: mia } = await registerUser(t, 'mia');
    await mia.put(`/api/calls/${call.id}/reminder`);
    const reached = () => 1; // every notice reaches an open page
    expect(sendCallReminders(t.db, reached)).toBe(0); // 20 minutes away, lead 10
    setSetting(t.db, 'calls.reminderLeadMinutes', 30);
    expect(sendCallReminders(t.db, reached)).toBe(1);
  });
});

describe('accounts', () => {
  it('"Registration open" off refuses new accounts; the first admin can still be made', async () => {
    t = makeTestApp({ bootstrapToken: 'a-token-long-enough-for-the-bootstrap' });
    setSetting(t.db, 'accounts.registrationOpen', false);
    const closed = await t
      .client()
      .post('/api/auth/register')
      .send(await registration('mia', 'correct-horse-1'));
    expect([closed.status, closed.body.message]).toEqual([
      403,
      'Registration is closed at the moment.',
    ]);
    const admin = await t
      .client()
      .post('/api/auth/bootstrap')
      .set('x-bootstrap-token', 'a-token-long-enough-for-the-bootstrap')
      .send(await registration('ada', 'correct-horse-1'));
    expect(admin.status).toBe(201);
    setSetting(t.db, 'accounts.registrationOpen', true);
    expect(
      (
        await t
          .client()
          .post('/api/auth/register')
          .send(await registration('mia', 'correct-horse-1'))
      ).status
    ).toBe(201);
  });

  it('the public settings come with the session, as they are now', async () => {
    t = makeTestApp();
    const settings = async () => (await t.client().get('/api/auth/session')).body.settings;
    // Every public setting, at the defaults the browser also falls back to.
    expect(await settings()).toEqual(PUBLIC_SETTING_DEFAULTS);
    setSetting(t.db, 'accounts.registrationOpen', false);
    expect((await settings())['accounts.registrationOpen']).toBe(false);
  });

  it('"Require 2FA for every member": a member without it is a guest until it is on', async () => {
    t = chatApp(); // with the chat's rooms
    const { agent: mia } = await registerUser(t, 'mia');
    expect((await mia.get('/api/keys/me')).status).toBe(200);
    setSetting(t.db, 'accounts.require2faAll', true);

    const session = (await mia.get('/api/auth/session')).body.user;
    expect(session).toMatchObject({ username: 'mia', twoFactorRequired: true });
    const refused = await mia.get('/api/keys/me');
    expect([refused.status, refused.body.error]).toEqual([403, 'two_factor_required']);
    // Public routes treat the member as a guest: a members-only room stays closed to them.
    t.db.prepare("UPDATE chat_rooms SET read_access = 'members' WHERE slug = 'general'").run();
    const general = (agent) => agent.get('/api/chat/rooms/general/messages');
    expect((await general(t.client())).status).toBe(404);
    expect((await general(mia)).status).toBe(404);

    // The setup itself is open to them; once 2FA is on, the member is a member again.
    const { authKey } = await keysFor('correct-horse-1');
    expect((await mia.post('/api/2fa/setup').send({ authKey })).body.secret).toBeTruthy();
    t.db
      .prepare(
        "INSERT OR REPLACE INTO two_factor (user_id, secret, enabled_at) VALUES (?, ?, 'now')"
      )
      .run(session.id, await sealSecret(STAFF_TOTP_SECRET, t.config.secretKey));
    expect((await mia.get('/api/keys/me')).status).toBe(200);
    expect((await general(mia)).status).toBe(200);
    expect((await mia.get('/api/auth/session')).body.user.twoFactorRequired).toBe(false);
  });
});
