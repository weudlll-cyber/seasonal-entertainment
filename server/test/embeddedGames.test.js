// ============================================================
// File:        embeddedGames.test.js
// Path:        server/test/embeddedGames.test.js
// Project:     Seasonal Entertainment
// Description: Guards the sign-in of the embedded games (games/embeddedRoutes.js,
//              games/embedded.js; docs/AUTH.md, "Embedded games"), for Bingo, Mini Games and the
//              race alike: GET /api/games/<slug>/authorize answers 204 with exactly the
//              X-Acting-User-* headers for a member, organiser and admin in good standing (id,
//              name, role, email verified, may host, Discord steps as base64url JSON with public
//              icon addresses) and X-Acting-Guest alone for anyone else (signed out, locked,
//              required 2FA missing); a state-changing original method needs this site's Origin,
//              an unknown one is refused, other methods on the route itself 405. Each game only
//              while switched on, an unknown slug never; GAMES_EMBEDDED and the Bingo-only
//              GAMES_BINGO_EMBEDDED=1 read as the list of switched-on games.
// ============================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { setSetting } from '../src/settings/store.js';
import { seedTestSteps } from './helpers/steps.js';
import { GAMES, TOKEN, gamesApp } from './helpers/embeddedGames.js';
import { ORIGIN, makeStaff, registerUser, setRole } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const withGames = (games) => (t = gamesApp(games));
let slug;

// The authorize answer as nginx's auth_request sends it: the browser's cookie (the agent's),
// the original method and, for a change, the browser's Origin.
const authorize = (agent, method = 'GET', origin, game = slug) => {
  const req = agent.get(`/api/games/${game}/authorize`).set('X-Original-Method', method);
  return origin === undefined ? req.unset('Origin') : req.set('Origin', origin);
};
const actingHeaders = (res) =>
  Object.fromEntries(Object.entries(res.headers).filter(([name]) => name.startsWith('x-acting-')));
const stepsOf = (res) =>
  JSON.parse(Buffer.from(res.headers['x-acting-user-steps'], 'base64url').toString('utf8'));

describe.each(GAMES)('GET /api/games/%s/authorize', (game) => {
  beforeEach(() => {
    slug = game;
  });

  it('a member: exactly the user headers, no steps without Discord', async () => {
    withGames();
    const { agent, user } = await registerUser(t, 'mia');
    const res = await authorize(agent);
    expect(res.status).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(actingHeaders(res)).toEqual({
      'x-acting-user-id': String(user.id),
      'x-acting-user': 'mia',
      'x-acting-user-roles': 'member',
      'x-acting-user-email-verified': 'true',
      'x-acting-user-can-host': 'false',
      'x-acting-user-steps': Buffer.from('[]').toString('base64url'),
    });
  });

  it('organiser and admin carry their role; admins, and members granted this game, may host', async () => {
    withGames();
    const { agent: olga } = await makeStaff(t, 'olga', 'organiser');
    const { agent: ada } = await makeStaff(t, 'ada', 'admin');
    const { agent: mia, user } = await registerUser(t, 'mia');
    const organiser = await authorize(olga);
    expect([
      organiser.headers['x-acting-user-roles'],
      organiser.headers['x-acting-user-can-host'],
    ]).toEqual(['organiser', 'false']);
    const admin = await authorize(ada);
    expect([admin.headers['x-acting-user-roles'], admin.headers['x-acting-user-can-host']]).toEqual(
      ['admin', 'true']
    );
    // A grant for the other game is not one for this game.
    const other = GAMES.find((g) => g !== slug);
    const grant = (game) =>
      t.db.prepare('INSERT INTO user_game_hosts (user_id, game) VALUES (?, ?)').run(user.id, game);
    grant(other);
    expect((await authorize(mia)).headers['x-acting-user-can-host']).toBe('false');
    expect((await authorize(mia, 'GET', undefined, other)).headers['x-acting-user-can-host']).toBe(
      'true'
    );
    grant(slug);
    expect((await authorize(mia)).headers['x-acting-user-can-host']).toBe('true');
  });

  it("a member's steps: the highest per ladder, with a public icon address", async () => {
    withGames();
    seedTestSteps(t.db);
    const { agent, user } = await registerUser(t, 'mia');
    const icon = 'step-icons/0123456789abcdef0123456789abcdef.webp';
    t.db
      .prepare("UPDATE discord_steps SET role_id = '11', icon_file = ? WHERE name = 'Golden'")
      .run(icon);
    t.db.prepare("UPDATE discord_steps SET role_id = '12' WHERE name = 'Bronze'").run();
    t.db.prepare("UPDATE discord_steps SET role_id = '13' WHERE name = 'Level 2'").run();
    t.db
      .prepare(
        `INSERT INTO discord_links (user_id, discord_id, discord_name, role_ids, linked_at, next_refresh_at)
         VALUES (?, '900', 'mia', '["11","12","13"]', '2026-11-04', '2099-01-01')`
      )
      .run(user.id);
    const steps = stepsOf(await authorize(agent));
    expect(steps).toEqual([
      { ladder: 'holder', name: 'Golden', icon: `/media/${icon}` },
      { ladder: 'investor', name: 'Level 2', icon: null },
    ]);
    // The icon is fetched by browsers without a login.
    mkdirSync(path.join(t.config.mediaDir, 'step-icons'), { recursive: true });
    writeFileSync(path.join(t.config.mediaDir, icon), 'webp bytes');
    expect((await t.client().get(`/media/${icon}`)).status).toBe(200);
  });

  it('anyone else gets X-Acting-Guest alone: signed out, locked, required 2FA missing', async () => {
    withGames();
    const guest = await authorize(t.client());
    expect(guest.status).toBe(204);
    expect(actingHeaders(guest)).toEqual({ 'x-acting-guest': 'true' });

    const { agent: locked, user } = await registerUser(t, 'lotte');
    t.db.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(user.id);
    expect(actingHeaders(await authorize(locked))).toEqual({ 'x-acting-guest': 'true' });

    // Staff whose 2FA is not set up, and members while the site requires it of everyone.
    const { agent: staff, user: sam } = await registerUser(t, 'sam');
    setRole(t, sam.id, 'organiser');
    expect(actingHeaders(await authorize(staff))).toEqual({ 'x-acting-guest': 'true' });
    const { agent: member } = await registerUser(t, 'mia');
    setSetting(t.db, 'accounts.require2faAll', true);
    expect(actingHeaders(await authorize(member))).toEqual({ 'x-acting-guest': 'true' });
  });

  it("a change needs this site's Origin; an unknown or missing method is refused", async () => {
    withGames();
    const { agent } = await registerUser(t, 'mia');
    expect((await authorize(agent, 'POST', 'https://evil.example')).status).toBe(403);
    expect((await authorize(agent, 'POST')).status).toBe(403);
    expect((await authorize(agent, 'POST', ORIGIN)).status).toBe(204);
    expect((await authorize(agent, 'TRACE', ORIGIN)).status).toBe(403);
    expect((await agent.get(`/api/games/${slug}/authorize`)).status).toBe(403); // no method
    expect((await authorize(agent, 'HEAD')).status).toBe(204);
  });

  it('other methods on the route itself: 405; switched off: 404, the other game unaffected', async () => {
    withGames();
    expect((await t.client().post(`/api/games/${slug}/authorize`)).status).toBe(405);
    t.close();
    const other = GAMES.find((g) => g !== slug);
    withGames({ embedded: [other] });
    const off = await authorize(t.client());
    expect([off.status, off.headers['cache-control']]).toEqual([404, 'no-store']);
    expect(
      (await t.client().get(`/api/games/${slug}/account-changes`).set('X-Games-Sync-Token', TOKEN))
        .status
    ).toBe(404);
    expect((await authorize(t.client(), 'GET', undefined, other)).status).toBe(204);
  });
});

describe('the list of embedded games', () => {
  it('an unknown slug is never a game: 404 for both routes, whatever is switched on', async () => {
    withGames();
    for (const unknown of ['chess', 'constructor', 'BINGO']) {
      expect((await authorize(t.client(), 'GET', undefined, unknown)).status).toBe(404);
      const feed = t.client().get(`/api/games/${unknown}/account-changes`);
      expect((await feed.set('X-Games-Sync-Token', TOKEN)).status).toBe(404);
    }
  });

  it('GAMES_EMBEDDED names the games; GAMES_BINGO_EMBEDDED=1 alone still means bingo', () => {
    const games = (env) => readConfig(env).games.embedded;
    expect(games({})).toEqual([]);
    expect(games({ GAMES_BINGO_EMBEDDED: '1' })).toEqual(['bingo']);
    expect(games({ GAMES_BINGO_EMBEDDED: '0' })).toEqual([]);
    expect(games({ GAMES_EMBEDDED: 'mini-games' })).toEqual(['mini-games']);
    expect(games({ GAMES_EMBEDDED: ' mini-games , bingo ' })).toEqual(['bingo', 'mini-games']);
    expect(games({ GAMES_EMBEDDED: 'mini-games', GAMES_BINGO_EMBEDDED: '1' })).toEqual([
      'bingo',
      'mini-games',
    ]);
    expect(games({ GAMES_EMBEDDED: 'race' })).toEqual(['race']);
    expect(games({ GAMES_EMBEDDED: 'race,mini-games,bingo' })).toEqual(GAMES);
    expect(GAMES).toEqual(['bingo', 'mini-games', 'race']);
    expect(() => games({ GAMES_EMBEDDED: 'bingo,chess' })).toThrow(/GAMES_EMBEDDED.*chess/);
  });

  it('a Bingo-only install (GAMES_BINGO_EMBEDDED=1) answers for Bingo as before, not Mini Games', async () => {
    const { games } = readConfig({ GAMES_BINGO_EMBEDDED: '1', GAMES_SYNC_TOKEN: TOKEN });
    withGames(games);
    const { agent } = await registerUser(t, 'mia');
    const bingo = await authorize(agent, 'GET', undefined, 'bingo');
    expect([bingo.status, bingo.headers['x-acting-user']]).toEqual([204, 'mia']);
    expect((await authorize(agent, 'GET', undefined, 'mini-games')).status).toBe(404);
  });
});
