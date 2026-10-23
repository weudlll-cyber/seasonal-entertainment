// ============================================================
// File:        callJoin.test.js
// Path:        server/test/callJoin.test.js
// Project:     Seasonal Entertainment
// Description: Joining a call (docs/CALLS.md, "Joining"): the issued token's exact grants per
//              role (listener: receive only; organiser: on the stage while it has room), short
//              lifetime, members by account and guests by their chat identity (never able to
//              publish), "A listener" for members who hide their online status, refusals
//              (not live, banned, call full), and raising hands (members only).
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { callApp, join, liveCall, newCall, organiser } from './helpers/calls.js';
import { registerUser } from './helpers/testApp.js';

let t;
let service;
afterEach(() => t.close());

const LISTENER_GRANT = {
  roomJoin: true,
  canUpdateOwnMetadata: false,
  canSubscribe: true,
  canPublish: false,
  canPublishData: false,
  canPublishSources: [],
};
const SPEAKER_SOURCES = ['microphone', 'camera', 'screen_share', 'screen_share_audio'];

const ban = (t, kind, { userId = null, guestId = null }) =>
  t.db
    .prepare(
      `INSERT INTO chat_sanctions (kind, user_id, guest_id, target, created_by, created_at)
       VALUES (?, ?, ?, 'x', 'mod', 'now')`
    )
    .run(kind, userId, guestId);

describe('join tokens', () => {
  it('a member listens: receive only, named, hand down, ten minutes', async () => {
    ({ t, service } = callApp());
    const call = await liveCall(await organiser(t));
    const mia = await registerUser(t, 'mia');
    const joined = await join(mia.agent, service, call);
    expect(joined).toMatchObject({ url: 'wss://calls.test', kind: 'member' });
    expect(joined.identity).toMatch(/^p-[0-9a-f]{24}$/);
    const { claims } = joined;
    expect(claims.video).toEqual({ ...LISTENER_GRANT, room: claims.video.room });
    expect(claims.video.room).toMatch(/^call-/);
    expect(claims.sub).toBe(joined.identity);
    expect(claims.name).toBe('mia');
    expect(claims.attributes).toEqual({ kind: 'member', hand: '0', handAt: '' });
    // Ten minutes. The token library reads the clock twice (exp from one reading, nbf from the
    // next), so when a second ticks over between them the difference is 599.
    expect([599, 600]).toContain(claims.exp - claims.nbf);
    // The same member keeps one identity for the call.
    expect((await join(mia.agent, service, call)).identity).toBe(joined.identity);
  });

  it('a guest listens by their chat guest identity and can never publish', async () => {
    ({ t, service } = callApp());
    const call = await liveCall(await organiser(t));
    const guest = t.client();
    const joined = await join(guest, service, call);
    expect(joined.kind).toBe('guest');
    expect(joined.claims.video).toMatchObject(LISTENER_GRANT);
    expect(joined.claims.name).toMatch(/^Guest-/);
    expect((await join(guest, service, call)).identity).toBe(joined.identity);
  });

  it('organisers start on the stage, as listeners once it is full', async () => {
    ({ t, service } = callApp());
    const olga = await organiser(t);
    const call = await liveCall(olga);
    const host = await join(olga, service, call);
    expect(host.kind).toBe('host');
    expect(host.claims.video).toMatchObject({
      canPublish: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      canPublishSources: SPEAKER_SOURCES,
    });
    t.db.prepare("INSERT INTO site_settings VALUES ('calls.maxSpeakers', '1')").run();
    const second = await join(await organiser(t, 'otto'), service, call);
    expect(second.claims.video).toMatchObject(LISTENER_GRANT);
  });

  it('a member who hides their online status listens as "A listener"', async () => {
    ({ t, service } = callApp());
    const call = await liveCall(await organiser(t));
    const shy = await registerUser(t, 'shy');
    t.db.prepare('UPDATE users SET show_online = 0 WHERE id = ?').run(shy.user.id);
    expect((await join(shy.agent, service, call)).claims.name).toBe('A listener');
  });
});

describe('refusals', () => {
  it('only live calls can be joined', async () => {
    ({ t, service } = callApp());
    const olga = await organiser(t);
    const scheduled = await newCall(olga);
    expect((await t.client().post(`/api/calls/${scheduled.id}/join`)).status).toBe(409);
    await olga.post(`/api/calls/${scheduled.id}/end`);
    const ended = await t.client().post(`/api/calls/${scheduled.id}/join`);
    expect([ended.status, ended.body.error]).toEqual([410, 'call_ended']);
  });

  it('members and guests banned in the chat cannot join', async () => {
    ({ t, service } = callApp());
    const call = await liveCall(await organiser(t));
    const mia = await registerUser(t, 'mia');
    ban(t, 'ban', { userId: mia.user.id });
    expect((await mia.agent.post(`/api/calls/${call.id}/join`)).body.error).toBe('banned');
    const guest = t.client();
    const joined = await join(guest, service, call);
    const guestId = t.db
      .prepare('SELECT guest_id FROM call_participants WHERE identity = ?')
      .get(joined.identity).guest_id;
    ban(t, 'ban', { guestId });
    expect((await guest.post(`/api/calls/${call.id}/join`)).status).toBe(403);
    // A chat mute does not keep anyone from listening.
    const ann = await registerUser(t, 'ann');
    ban(t, 'mute', { userId: ann.user.id });
    expect((await join(ann.agent, service, call)).kind).toBe('member');
  });

  it('is refused when the call is full, except for someone already in it', async () => {
    ({ t, service } = callApp());
    const call = await liveCall(await organiser(t));
    t.db.prepare("INSERT INTO site_settings VALUES ('calls.maxParticipants', '2')").run();
    const mia = await registerUser(t, 'mia');
    await join(mia.agent, service, call);
    await join(t.client(), service, call);
    const third = await t.client().post(`/api/calls/${call.id}/join`);
    expect([third.status, third.body.error]).toEqual([403, 'call_full']);
    expect((await mia.agent.post(`/api/calls/${call.id}/join`)).status).toBe(200);
  });
});

describe('raising a hand', () => {
  it('members raise and lower it; the call service gets it as attributes', async () => {
    ({ t, service } = callApp());
    const call = await liveCall(await organiser(t));
    const mia = await registerUser(t, 'mia');
    const { identity } = await join(mia.agent, service, call);
    expect((await mia.agent.post(`/api/calls/${call.id}/hand`).send({ raised: true })).status).toBe(
      200
    );
    const [, who, { attributes }] = service.log.at(-1);
    expect(who).toBe(identity);
    expect(attributes.hand).toBe('1');
    expect(Date.parse(attributes.handAt)).not.toBeNaN();
    // A new token after a reload still carries the raised hand.
    expect((await join(mia.agent, service, call)).claims.attributes.hand).toBe('1');
    await mia.agent.post(`/api/calls/${call.id}/hand`).send({ raised: false });
    expect(service.log.at(-1)[2].attributes).toEqual({ hand: '0', handAt: '' });
  });

  it('guests cannot; members must have joined; speakers need no hand', async () => {
    ({ t, service } = callApp());
    const olga = await organiser(t);
    const call = await liveCall(olga);
    const guest = t.client();
    await join(guest, service, call);
    expect((await guest.post(`/api/calls/${call.id}/hand`).send({ raised: true })).status).toBe(
      401
    );
    const mia = await registerUser(t, 'mia');
    const early = await mia.agent.post(`/api/calls/${call.id}/hand`).send({ raised: true });
    expect([early.status, early.body.error]).toEqual([409, 'not_joined']);
    await join(olga, service, call);
    expect((await olga.post(`/api/calls/${call.id}/hand`).send({ raised: true })).status).toBe(409);
  });
});
