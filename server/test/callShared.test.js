// ============================================================
// File:        callShared.test.js
// Path:        server/test/callShared.test.js
// Project:     Seasonal Entertainment
// Description: Sharing a call with the games (docs/CALLS.md): organisers and admins may, others
//              not; only one call is shared (409 shared_elsewhere, replaced only when asked,
//              also on create; the index refuses a second flag); a scheduled or live call only;
//              ending a call clears it; the public read's two shapes and its cache header; an
//              older database gets the column; every change is audited.
// ============================================================

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { CALLS_SCHEMA, migrateCalls } from '../src/calls/schema.js';
import { callApp, liveCall, newCall, organiser } from './helpers/calls.js';
import { auditActions } from './helpers/chat.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const share = (agent, call, body = { shared: true }) =>
  agent.put(`/api/calls/${call.id}/shared`).send(body);
const read = () => t.client().get('/api/public/shared-call');
const shareAudits = () =>
  t.db
    .prepare(
      `SELECT action, target_id AS id, after FROM audit_log
       WHERE action IN ('call.share', 'call.unshare') ORDER BY id`
    )
    .all()
    .map((row) => ({ action: row.action, id: Number(row.id), ...JSON.parse(row.after) }));

describe('who may share a call', () => {
  it('guests and members are refused, organisers and admins are not', async () => {
    ({ t } = callApp());
    const olga = await organiser(t);
    const call = await newCall(olga);
    const member = (await registerUser(t, 'mia')).agent;
    expect((await share(t.client(), call)).status).toBe(401);
    expect((await share(member, call)).status).toBe(403);
    expect((await read()).body.call).toBeNull();
    // Any organiser, not only the one who created the call, and any admin.
    const other = await organiser(t, 'oskar');
    expect((await share(other, call)).body.call).toMatchObject({ sharedWithGames: true });
    const admin = (await makeStaff(t, 'ada', 'admin')).agent;
    const unshared = await share(admin, call, { shared: false });
    expect(unshared.body.call).toMatchObject({ sharedWithGames: false });
  });

  it('refuses a request that does not say yes or no, and an ended call', async () => {
    ({ t } = callApp());
    const olga = await organiser(t);
    const call = await liveCall(olga);
    expect((await share(olga, call, {})).status).toBe(400);
    expect((await share(olga, call, { shared: true, replace: 'yes' })).status).toBe(400);
    await olga.post(`/api/calls/${call.id}/end`);
    const late = await share(olga, call);
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('wrong_status');
    expect((await read()).body.call).toBeNull();
  });
});

describe('only one call is shared', () => {
  it('answers 409 with the shared call, and replaces it only when asked', async () => {
    ({ t } = callApp());
    const olga = await organiser(t);
    const first = await liveCall(olga, 'First');
    const second = await newCall(olga, 'Second');
    await share(olga, first);

    const refused = await share(olga, second);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      error: 'shared_elsewhere',
      call: { id: first.id, title: 'First' },
    });
    expect((await read()).body.call).toEqual({ id: first.id, title: 'First' });

    expect((await share(olga, second, { shared: true, replace: true })).status).toBe(200);
    expect((await read()).body.call).toEqual({ id: second.id, title: 'Second' });
    expect((await olga.get(`/api/calls/${first.id}`)).body.call.sharedWithGames).toBe(false);
    // Asking again for what holds changes nothing.
    expect((await share(olga, second)).status).toBe(200);
    expect((await share(olga, first, { shared: false })).status).toBe(200);
    expect(shareAudits()).toEqual([
      { action: 'call.share', id: first.id, title: 'First' },
      { action: 'call.unshare', id: first.id, title: 'First', replacedBy: second.id },
      { action: 'call.share', id: second.id, title: 'Second', replaced: first.id },
    ]);
  });

  it('shares on create; with another shared, nothing is created unless it is replaced', async () => {
    ({ t } = callApp());
    const olga = await organiser(t);
    const create = (body) => olga.post('/api/calls').send(body);
    const first = (await create({ title: 'First', sharedWithGames: true })).body.call;
    expect(first.sharedWithGames).toBe(true);

    const refused = await create({ title: 'Second', sharedWithGames: true });
    expect(refused.status).toBe(409);
    expect(refused.body.call).toEqual({ id: first.id, title: 'First' });
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM calls').get().n).toBe(1);
    // A call that is not to be shared is created as ever.
    expect((await create({ title: 'Plain' })).body.call.sharedWithGames).toBe(false);

    const second = await create({ title: 'Second', sharedWithGames: true, replace: true });
    expect(second.status).toBe(201);
    expect((await read()).body.call).toEqual({ id: second.body.call.id, title: 'Second' });
    expect(auditActions(t)).toEqual([
      'call.create',
      'call.share',
      'call.create',
      'call.create',
      'call.unshare',
      'call.share',
    ]);
  });

  it('is also held by the database', async () => {
    ({ t } = callApp());
    const olga = await organiser(t);
    await newCall(olga, 'One');
    await newCall(olga, 'Two');
    expect(() => t.db.prepare('UPDATE calls SET shared_with_games = 1').run()).toThrow(/UNIQUE/);
  });
});

describe('the end of a shared call, and the public read', () => {
  it('clears the flag when the call ends', async () => {
    ({ t } = callApp());
    const olga = await organiser(t);
    const call = await liveCall(olga);
    await share(olga, call);
    await olga.post(`/api/calls/${call.id}/end`);
    expect((await read()).body.call).toBeNull();
    expect((await olga.get(`/api/calls/${call.id}`)).body.call.sharedWithGames).toBe(false);
  });

  it('answers everyone with the id and title only, cacheable for 5 seconds', async () => {
    ({ t } = callApp());
    const none = await read();
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ v: 1, call: null });
    expect(none.headers['cache-control']).toBe('public, max-age=5');
    const olga = await organiser(t);
    const call = await newCall(olga, 'Town hall');
    await share(olga, call);
    // A scheduled call too: the view says that it has not started.
    const one = await read();
    expect(one.body).toEqual({ v: 1, call: { id: call.id, title: 'Town hall' } });
    expect(one.headers['cache-control']).toBe('public, max-age=5');
  });

  it('shares nothing while calls are not set up', async () => {
    ({ t } = callApp());
    t.close();
    const { chatApp } = await import('./helpers/chat.js');
    t = chatApp();
    expect((await read()).body).toEqual({ v: 1, call: null });
  });
});

describe('an older database', () => {
  it('gets the column and the one-shared-call index', () => {
    const db = new Database(':memory:');
    db.exec(CALLS_SCHEMA.replace(/,\s*shared_with_games[^\n]*/, ''));
    const columns = () =>
      db
        .prepare('PRAGMA table_info(calls)')
        .all()
        .map((c) => c.name);
    expect(columns()).not.toContain('shared_with_games');
    migrateCalls(db);
    migrateCalls(db); // a second start changes nothing
    expect(columns()).toContain('shared_with_games');
    const indexes = db
      .prepare('PRAGMA index_list(calls)')
      .all()
      .map((i) => i.name);
    expect(indexes).toContain('calls_one_shared');
    db.close();
  });
});
