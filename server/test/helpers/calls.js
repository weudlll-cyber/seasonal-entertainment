// ============================================================
// File:        calls.js
// Path:        server/test/helpers/calls.js
// Project:     Seasonal Entertainment
// Description: Test helpers for calls: a stand-in call service with the methods of
//              calls/service.js that records every request and keeps who is "connected" (no
//              call server needed; tokens are signed for real with test keys and can be
//              decoded), an app with calls switched on and the seeded chat rooms, creating and
//              starting a call as an organiser, and joining one.
// ============================================================

import { TokenVerifier } from 'livekit-server-sdk';
import { joinToken } from '../../src/calls/grants.js';
import { chatApp } from './chat.js';
import { makeStaff } from './testApp.js';

export const TEST_KEYS = { apiKey: 'test-key', apiSecret: 'test-secret-of-at-least-32-characters' };

// Decodes a join token with the test keys: its claims ({ sub, name, video, attributes, ... }).
export const claimsOf = (token) =>
  new TokenVerifier(TEST_KEYS.apiKey, TEST_KEYS.apiSecret).verify(token);

export function fakeCallService() {
  const log = [];
  // identity -> { identity, name, permission, attributes, tracks }: who is connected now.
  const connected = new Map();
  return {
    log,
    connected,
    url: 'wss://calls.test',
    openRoom: async (name, maxParticipants) => log.push(['open', name, maxParticipants]),
    closeRoom: async (name) => log.push(['close', name]),
    listParticipants: async () => [...connected.values()],
    updateParticipant: async (_room, identity, options) => {
      log.push(['update', identity, options]);
      const p = connected.get(identity);
      if (options.permission) p.permission = { ...p.permission, ...options.permission };
      if (options.name) p.name = options.name;
      if (options.attributes) p.attributes = { ...p.attributes, ...options.attributes };
    },
    muteTrack: async (_room, identity, sid) => log.push(['mute', identity, sid]),
    setRoomMetadata: async (_room, metadata) => log.push(['metadata', JSON.parse(metadata)]),
    token: (claims) => joinToken(TEST_KEYS, claims),
  };
}

// { t, service }: an app with the seeded chat rooms whose calls use the stand-in service.
export function callApp(overrides) {
  const service = fakeCallService();
  return { t: chatApp(overrides, { callService: service }), service };
}

export async function organiser(t, name = 'olga') {
  return (await makeStaff(t, name, 'organiser')).agent;
}

export async function newCall(agent, title = 'Community call') {
  const res = await agent.post('/api/calls').send({ title });
  if (res.status !== 201) throw new Error(`create call failed: ${res.status} ${res.text}`);
  return res.body.call;
}

export async function liveCall(agent, title) {
  const call = await newCall(agent, title);
  await agent.post(`/api/calls/${call.id}/start`);
  return call;
}

// Joins through the route and "connects" with the token, as a browser would. Returns the
// response body plus the decoded claims.
export async function join(agent, service, call) {
  const res = await agent.post(`/api/calls/${call.id}/join`);
  if (res.status !== 200) return res;
  const claims = await claimsOf(res.body.token);
  service.connected.set(res.body.identity, {
    identity: res.body.identity,
    name: claims.name,
    permission: { canPublish: claims.video.canPublish },
    attributes: claims.attributes,
    tracks: [],
  });
  return { ...res.body, claims };
}
