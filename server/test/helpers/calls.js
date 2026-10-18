// ============================================================
// File:        calls.js
// Path:        server/test/helpers/calls.js
// Project:     Seasonal Entertainment
// Description: Test helpers for calls: a stand-in call service with the methods of
//              calls/service.js that records every request (no call server needed), an app
//              with calls switched on and the seeded chat rooms, and creating a call as an
//              organiser.
// ============================================================

import { chatApp } from './chat.js';
import { makeStaff } from './testApp.js';

export function fakeCallService() {
  const log = [];
  return {
    log,
    url: 'wss://calls.test',
    openRoom: async (name, maxParticipants) => log.push(['open', name, maxParticipants]),
    closeRoom: async (name) => log.push(['close', name]),
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
