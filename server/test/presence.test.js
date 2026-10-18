// ============================================================
// File:        presence.test.js
// Path:        server/test/presence.test.js
// Project:     Seasonal Entertainment
// Description: Guards "Show when I'm online": on by default (new and existing accounts); off, the
//              member appears offline to everyone else in every presence the server hands out
//              (favourites, the Direct list, a conversation, the member search) while their own
//              view of others is unchanged; on again shows them; only the member can change it;
//              others' open sockets hear "presence" at once.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { sendDirect } from './helpers/direct.js';
import { memberWithKey } from './helpers/keys.js';

let t;
let server;
let sockets = [];
afterEach(async () => {
  for (const s of sockets) s.ws.close();
  sockets = [];
  await stopServer(server);
  t?.close();
});

// anna and ben, both with keys and a conversation, ben a favourite of anna and the other way
// round, both online (an open chat socket each).
async function bothOnline() {
  let url;
  ({ t, server, url } = await listeningChat());
  const anna = await memberWithKey(t, 'anna');
  const ben = await memberWithKey(t, 'ben');
  await anna.agent.put(`/api/chat/favourites/users/${ben.user.id}`).expect(200);
  await ben.agent.put(`/api/chat/favourites/users/${anna.user.id}`).expect(200);
  expect((await sendDirect(anna, ben.user, { text: 'hi' })).status).toBe(201);
  sockets = [anna, ben].map((m) => connect(url, { cookie: cookieOf(m.agent) }));
  await Promise.all(sockets.map((s) => s.opened));
  return { anna, ben };
}

// Every place that tells `viewer` whether `other` is online.
async function presenceOf(viewer, other) {
  const favourites = (await viewer.agent.get('/api/chat/favourites')).body.users;
  const conversations = (await viewer.agent.get('/api/chat/direct')).body.conversations;
  const conversation = (await viewer.agent.get(`/api/chat/direct/${other.user.id}`)).body;
  const search = (await viewer.agent.get('/api/chat/members').query({ q: other.user.username }))
    .body.members;
  return [
    favourites.find((u) => u.id === other.user.id).online,
    conversations.find((c) => c.partner.id === other.user.id).partner.online,
    conversation.partner.online,
    search.find((m) => m.id === other.user.id).online,
  ];
}

describe("Show when I'm online", () => {
  it('is on by default: others see the member online everywhere', async () => {
    const { anna, ben } = await bothOnline();
    expect((await anna.agent.get('/api/auth/session')).body.user.showOnline).toBe(true);
    expect(await presenceOf(ben, anna)).toEqual([true, true, true, true]);
  });

  it('off: offline to everyone else; the member still sees others; on again: online', async () => {
    const { anna, ben } = await bothOnline();
    await anna.agent.put('/api/auth/privacy').send({ showOnline: false }).expect(200);
    expect((await anna.agent.get('/api/auth/session')).body.user.showOnline).toBe(false);
    expect(await presenceOf(ben, anna)).toEqual([false, false, false, false]);
    // Her own view of ben is unchanged.
    expect(await presenceOf(anna, ben)).toEqual([true, true, true, true]);
    await anna.agent.put('/api/auth/privacy').send({ showOnline: true }).expect(200);
    expect(await presenceOf(ben, anna)).toEqual([true, true, true, true]);
  });

  it('only the member changes it; others hear "presence" at once', async () => {
    const { anna, ben } = await bothOnline();
    // ben cannot switch anna off: the account always comes from the session.
    await ben.agent
      .put('/api/auth/privacy')
      .send({ showOnline: false, userId: anna.user.id })
      .expect(200);
    expect(await presenceOf(anna, ben)).toEqual([false, false, false, false]);
    expect(await presenceOf(ben, anna)).toEqual([true, true, true, true]);
    expect(await sockets[0].next('presence')).toEqual({ type: 'presence' });
    expect((await t.client().put('/api/auth/privacy').send({ showOnline: false })).status).toBe(
      401
    );
    expect((await ben.agent.put('/api/auth/privacy').send({ showOnline: 'no' })).status).toBe(400);
  });
});

it('existing accounts are on after the migration', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'se-presence-'));
  const file = path.join(dir, 'old.db');
  const old = new Database(file);
  old.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', can_start_games INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0, session_epoch INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT 'now')`);
  old
    .prepare("INSERT INTO users (username, email, password_hash) VALUES ('old', 'o@x.org', 'h')")
    .run();
  old.close();
  const db = openDatabase(file);
  const row = db.prepare('SELECT show_online AS s FROM users').get();
  db.close();
  rmSync(dir, { recursive: true, force: true });
  expect(row.s).toBe(1);
});
