// ============================================================
// File:        embed.js
// Path:        server/test/helpers/embed.js
// Project:     Seasonal Entertainment
// Description: Test helpers for the chat embedded on approved foreign sites (embed/): an
//              admin approving a site through the real route, the login popup's token request
//              (with the member's cookie agent), and an agent that sends a token the way the
//              embed does (X-Embed-Token, no cookie).
// ============================================================

import request from 'supertest';
import { ORIGIN, makeStaff } from './testApp.js';

export const SITE = 'https://game.example';

// The admin's agent after approving `origin` (one admin per app).
export async function approveSite(t, origin = SITE) {
  t.embedAdmin ??= (await makeStaff(t, 'ada', 'admin')).agent;
  const res = await t.embedAdmin.post('/api/admin/embed-origins').send({ origin });
  if (res.status !== 201) throw new Error(`approve ${origin}: ${res.status} ${res.text}`);
  return t.embedAdmin;
}

export const removeSite = (t, origin = SITE) =>
  t.embedAdmin.delete('/api/admin/embed-origins').send({ origin });

// What the popup asks for with the member's cookie session: { status, body }.
export const requestToken = (agent, origin = SITE) =>
  agent.post('/api/embed/token').send({ origin });

// A fresh agent with no cookie, sending the token as the embed does.
export const tokenAgent = (t, token) =>
  request.agent(t.app).set('Origin', ORIGIN).set('X-Embed-Token', token);
