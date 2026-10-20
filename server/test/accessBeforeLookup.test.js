// ============================================================
// File:        accessBeforeLookup.test.js
// Path:        server/test/accessBeforeLookup.test.js
// Project:     Seasonal Entertainment
// Description: Guards that authorisation runs before any id lookup: a caller who may not use
//              a route gets the same answer for an existing and a missing id, so ids cannot be
//              probed. Also fails if any router loads ids with router.param, which runs before
//              the route's allow() guard.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { seedGames } from '../src/games/seed.js';
import { seedInfoPages } from '../src/info/seed.js';
import { chatApp, post } from './helpers/chat.js';
import { registerUser, setRole } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const firstId = (table) => t.db.prepare(`SELECT MIN(id) AS id FROM ${table}`).get().id;

describe('an unauthorised caller cannot tell which ids exist', () => {
  it('guest, member and organiser without 2FA: same status for existing and missing ids', async () => {
    t = chatApp();
    seedInfoPages(t.db);
    seedGames(t.db);
    const { agent: member, user } = await registerUser(t, 'mia');
    const { agent: owen, user: owenUser } = await registerUser(t, 'owen');
    setRole(t, owenUser.id, 'organiser'); // without 2FA
    const { message } = (await post(member, 'general', 'hi')).body;
    const routes = [
      ['post', '/api/admin/users/:id/role', user.id],
      ['post', '/api/chat/messages/:id/hide', message.id],
      ['put', '/api/admin/info/:id', firstId('info_pages')],
      ['put', '/api/admin/games/:id', firstId('games')],
      ['put', '/api/admin/chat/rooms/:id', firstId('chat_rooms')],
    ];
    for (const caller of [t.client(), member, owen]) {
      for (const [method, path, existing] of routes) {
        const call = (id) => caller[method](path.replace(':id', id)).send({});
        const [found, missing] = [await call(existing), await call(999999)];
        expect(found.status, path).not.toBe(404);
        expect(found.status, path).toBe(missing.status);
        expect(found.body, path).toEqual(missing.body);
      }
    }
  });

  it('no router loads ids with router.param (it runs before allow())', () => {
    t = chatApp();
    const withParams = [];
    const walk = (stack) => {
      for (const layer of stack) {
        if (!layer.handle?.stack) continue;
        if (Object.keys(layer.handle.params ?? {}).length) withParams.push(layer.matchers);
        walk(layer.handle.stack);
      }
    };
    walk(t.app.router.stack);
    expect(withParams).toEqual([]);
  });
});
