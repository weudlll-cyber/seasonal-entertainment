// ============================================================
// File:        callStage.test.js
// Path:        server/test/callStage.test.js
// Project:     Seasonal Entertainment
// Description: Organisers' stage actions (docs/CALLS.md, "The stage"): only organisers and
//              admins invite, remove and mute; an invited member gets exactly the speaker
//              permission and their name; guests and members muted in the chat are refused,
//              as are people not connected and invitations above the stage cap; removal
//              revokes publishing; mute reaches microphone tracks only; speakers may leave;
//              every organiser action is audited and rate-limited.
// ============================================================

import { TrackSource } from 'livekit-server-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { callApp, join, liveCall, organiser } from './helpers/calls.js';
import { auditActions } from './helpers/chat.js';
import { registerUser } from './helpers/testApp.js';

let t;
let service;
afterEach(() => t.close());

const SPEAKER = {
  canSubscribe: true,
  canPublish: true,
  canPublishData: false,
  canPublishSources: [
    TrackSource.MICROPHONE,
    TrackSource.CAMERA,
    TrackSource.SCREEN_SHARE,
    TrackSource.SCREEN_SHARE_AUDIO,
  ],
};
const LISTENER = {
  canSubscribe: true,
  canPublish: false,
  canPublishData: false,
  canPublishSources: [],
};

// A live call with an organiser and the member "mia" connected as a listener.
async function stage() {
  ({ t, service } = callApp());
  const olga = await organiser(t);
  const call = await liveCall(olga);
  await join(olga, service, call);
  const mia = await registerUser(t, 'mia');
  const listener = await join(mia.agent, service, call);
  return { olga, call, mia, identity: listener.identity };
}
const invite = (agent, call, identity) => agent.post(`/api/calls/${call.id}/stage/${identity}`);

describe('inviting to the stage', () => {
  it('gives exactly the speaker permission and the real name', async () => {
    const { olga, call, mia, identity } = await stage();
    t.db.prepare('UPDATE users SET show_online = 0 WHERE id = ?').run(mia.user.id);
    expect((await invite(olga, call, identity)).status).toBe(200);
    const [kind, who, options] = service.log.at(-1);
    expect([kind, who]).toEqual(['update', identity]);
    expect(options).toEqual({
      permission: SPEAKER,
      name: 'mia',
      attributes: { hand: '0', handAt: '' },
    });
    // A new token (reload) keeps the stage.
    expect((await join(mia.agent, service, call)).claims.video.canPublish).toBe(true);
    expect(auditActions(t)).toContain('call.invite');
  });

  it('is for organisers and admins only', async () => {
    const { call, mia, identity } = await stage();
    expect((await invite(mia.agent, call, identity)).status).toBe(403);
    expect((await invite(t.client(), call, identity)).status).toBe(401);
    expect(service.log.some(([kind]) => kind === 'update')).toBe(false);
  });

  it('refuses guests, members muted in the chat, people not connected, a full stage', async () => {
    const { olga, call, identity } = await stage();
    const guest = await join(t.client(), service, call);
    expect((await invite(olga, call, guest.identity)).body.error).toBe('guest_listener');

    const ann = await registerUser(t, 'ann');
    const annIn = await join(ann.agent, service, call);
    t.db
      .prepare(
        `INSERT INTO chat_sanctions (kind, user_id, target, until, created_by, created_at)
         VALUES ('mute', ?, 'ann', '2999-01-01', 'mod', 'now')`
      )
      .run(ann.user.id);
    expect((await invite(olga, call, annIn.identity)).body.error).toBe('sanctioned');

    service.connected.delete(identity);
    expect((await invite(olga, call, identity)).body.error).toBe('not_connected');
    await join((await registerUser(t, 'mia2')).agent, service, call);

    t.db.prepare("INSERT INTO site_settings VALUES ('calls.maxSpeakers', '1')").run();
    const bob = await registerUser(t, 'bob');
    const bobIn = await join(bob.agent, service, call);
    expect((await invite(olga, call, bobIn.identity)).body.error).toBe('stage_full');
    expect((await olga.post(`/api/calls/${call.id}/stage/p-nobody`)).status).toBe(404);
  });
});

describe('leaving the stage and muting', () => {
  it('removal revokes publishing; a speaker may leave by themselves', async () => {
    const { olga, call, mia, identity } = await stage();
    await invite(olga, call, identity);
    expect((await olga.delete(`/api/calls/${call.id}/stage/${identity}`)).status).toBe(200);
    expect(service.log.at(-1)).toEqual(['update', identity, { permission: LISTENER, name: 'mia' }]);
    expect((await join(mia.agent, service, call)).claims.video.canPublish).toBe(false);
    expect(auditActions(t)).toContain('call.unstage');
    expect((await olga.delete(`/api/calls/${call.id}/stage/${identity}`)).status).toBe(409);

    await invite(olga, call, identity);
    expect((await mia.agent.post(`/api/calls/${call.id}/leave-stage`)).status).toBe(200);
    expect(service.log.at(-1)[2].permission).toEqual(LISTENER);
    expect((await mia.agent.post(`/api/calls/${call.id}/leave-stage`)).status).toBe(409);
  });

  it('mute reaches the speaker microphone tracks only, by organisers only', async () => {
    const { olga, call, mia, identity } = await stage();
    await invite(olga, call, identity);
    service.connected.get(identity).tracks = [
      { sid: 'TR_mic', source: TrackSource.MICROPHONE, muted: false },
      { sid: 'TR_cam', source: TrackSource.CAMERA, muted: false },
      { sid: 'TR_screen_audio', source: TrackSource.SCREEN_SHARE_AUDIO, muted: false },
    ];
    expect((await mia.agent.post(`/api/calls/${call.id}/mute/${identity}`)).status).toBe(403);
    const res = await olga.post(`/api/calls/${call.id}/mute/${identity}`);
    expect(res.body.muted).toBe(1);
    expect(service.log.filter(([kind]) => kind === 'mute')).toEqual([['mute', identity, 'TR_mic']]);
    expect(auditActions(t)).toContain('call.mute');
  });

  it('organiser actions are rate-limited per account', async () => {
    ({ t, service } = callApp({ rateLimits: { callAction: { windowMs: 60_000, max: 1 } } }));
    const olga = await organiser(t);
    const call = await liveCall(olga);
    const mia = await join((await registerUser(t, 'mia')).agent, service, call);
    expect((await invite(olga, call, mia.identity)).status).toBe(200);
    expect((await olga.post(`/api/calls/${call.id}/mute/${mia.identity}`)).status).toBe(429);
  });
});
