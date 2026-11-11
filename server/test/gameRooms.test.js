// ============================================================
// File:        gameRooms.test.js
// Path:        server/test/gameRooms.test.js
// Project:     Seasonal Entertainment
// Description: Guards the chat rooms of the embedded games (chat/seed.js ensureGameRooms, run by
//              the chat's start; docs/EMBED.md, "The embedded games' rooms"): while a game is
//              switched on its room exists (bingo "Bingo", mini-games "Mini Games"), guests
//              read, members write; created once, never recreated or changed after an admin
//              edited it, kept with its messages when the game is switched off; the first-start
//              rooms still come on an empty database. The race's room is the first-start room
//              "Seasonal Race" (slug race, decided 2026-11-11): its game finds it and keeps its
//              members-only rules. The chat embed (/embed/chat?room=<slug>) may be framed by
//              this site's own pages, such as /games/<slug>/, for every game.
// ============================================================

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GAMES, TOKEN, gamesApp } from './helpers/embeddedGames.js';
import { bodies, post } from './helpers/chat.js';
import { ORIGIN, makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const NAMES = { bingo: 'Bingo', 'mini-games': 'Mini Games' };
// The games whose room the start adds; the race's comes with the first-start rooms.
const ADDED = GAMES.filter((slug) => slug !== 'race');
const roomOf = (slug) => t.db.prepare('SELECT * FROM chat_rooms WHERE slug = ?').get(slug);
const roomCount = () => t.db.prepare('SELECT COUNT(*) AS n FROM chat_rooms').get().n;

// The chat's start as the server runs it (index.js); returns what it logged.
async function start() {
  const lines = [];
  await t.app.locals.chat.start((line) => lines.push(line));
  return lines;
}

describe("the embedded games' rooms", () => {
  it('a first start adds the usual rooms and one room per switched-on game', async () => {
    t = gamesApp();
    const lines = await start();
    expect(roomOf('general')).toBeTruthy();
    for (const slug of ADDED) {
      expect(roomOf(slug)).toMatchObject({
        name: NAMES[slug],
        read_access: 'everyone',
        write_access: 'members',
        guest_writable: 0,
        listed: 1,
        closed: 0,
      });
      expect(lines).toContain(`Added the chat room "${slug}" for its embedded game`);
    }
    // The race's room: the seeded one, found, not added, its rules as seeded.
    expect(roomOf('race')).toMatchObject({
      name: 'Seasonal Race',
      read_access: 'members',
      write_access: 'members',
      guest_writable: 0,
    });
    expect(lines).not.toContain('Added the chat room "race" for its embedded game');
  });

  it('only the games switched on get a room', async () => {
    t = gamesApp({ embedded: ['mini-games'] });
    await start();
    expect(roomOf('mini-games')).toBeTruthy();
    expect(roomOf('bingo')).toBeUndefined();
  });

  it('guests read, members write', async () => {
    t = gamesApp();
    await start();
    const { agent: member } = await registerUser(t, 'mia');
    for (const slug of ADDED) {
      expect((await post(member, slug, `hello ${slug}`)).status).toBe(201);
      expect(await bodies(t.client(), slug)).toEqual([`hello ${slug}`]);
      expect((await post(t.client(), slug, 'a guest')).status).toBe(403);
    }
  });

  it('created once: an admin edit stays, nothing is recreated on the next start', async () => {
    t = gamesApp();
    await start();
    const rooms = roomCount();
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const edited = await admin.put(`/api/admin/chat/rooms/${roomOf('bingo').id}`).send({
      slug: 'bingo',
      name: 'Bingo hall',
      readAccess: 'members',
      writeAccess: 'organisers',
    });
    expect(edited.status).toBe(200);
    expect(await start()).not.toContain('Added the chat room "bingo" for its embedded game');
    expect(roomCount()).toBe(rooms);
    expect(roomOf('bingo')).toMatchObject({
      name: 'Bingo hall',
      read_access: 'members',
      write_access: 'organisers',
    });
  });

  it('switching a game off keeps its room and messages', async () => {
    t = gamesApp();
    await start();
    const { agent: member } = await registerUser(t, 'mia');
    await post(member, 'mini-games', 'still here');
    // The next start with Mini Games switched off (the same database).
    t.config.games.embedded = ['bingo'];
    await start();
    expect(roomOf('mini-games')).toBeTruthy();
    expect(await bodies(t.client(), 'mini-games')).toEqual(['still here']);
  });
});

describe('the chat embed inside a game', () => {
  const ancestors = (res) =>
    res.headers['content-security-policy']
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('frame-ancestors'));

  it.each(GAMES)("/embed/chat?room=%s may be framed by this site's /games/ pages", async (slug) => {
    // The built client's page, which /embed/chat serves.
    const clientDist = mkdtempSync(path.join(tmpdir(), 'se-dist-'));
    writeFileSync(path.join(clientDist, 'index.html'), '<!doctype html><title>shell</title>');
    t = makeTestApp({ clientDist, games: { embedded: GAMES, syncToken: TOKEN } });
    // As a browser loads it inside the game's page: a frame, asked from /games/<slug>/ on this
    // same site, so 'self' lets it in (the game's page is the site's origin, nginx's route).
    const res = await t
      .client()
      .get(`/embed/chat?room=${slug}&theme=auto`)
      .set('Referer', `${ORIGIN}/games/${slug}/`)
      .set('Sec-Fetch-Dest', 'iframe');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>shell</title>');
    expect(ancestors(res)).toBe("frame-ancestors 'self'");
    expect(res.headers['x-frame-options']).toBeUndefined();
    rmSync(clientDist, { recursive: true, force: true });
  });
});
