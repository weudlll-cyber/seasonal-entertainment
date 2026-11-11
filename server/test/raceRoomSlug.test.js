// ============================================================
// File:        raceRoomSlug.test.js
// Path:        server/test/raceRoomSlug.test.js
// Project:     Seasonal Entertainment
// Description: Guards the one-time rename of the seeded "Seasonal Race" room's slug from
//              seasonal-race to race, the race game's slug (chat/schema.js migrateChat; decided
//              2026-11-11): a database from before keeps the room's id, name, rules, messages
//              and favourites under the new slug; running it again changes nothing; a "race"
//              room already there is never touched.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { migrateChat } from '../src/chat/schema.js';
import { bodies, chatApp, post } from './helpers/chat.js';
import { registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const rooms = () =>
  t.db
    .prepare('SELECT id, slug, name, read_access, write_access FROM chat_rooms ORDER BY id')
    .all();
const roomOf = (slug) => t.db.prepare('SELECT * FROM chat_rooms WHERE slug = ?').get(slug);

describe("the race room's slug", () => {
  it('a database from before: the room keeps everything under the slug race, once', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'mia');
    expect((await post(agent, 'race', 'before the rename')).status).toBe(201);
    await agent.put('/api/chat/favourites/rooms/race').expect(200);
    const { id } = roomOf('race');
    // As a database from before 2026-11-11 has it, with an admin's own name and write rule.
    t.db
      .prepare(
        "UPDATE chat_rooms SET slug = 'seasonal-race', name = 'Race talk', write_access = 'organisers' WHERE id = ?"
      )
      .run(id);

    migrateChat(t.db);
    expect(roomOf('seasonal-race')).toBeUndefined();
    expect(roomOf('race')).toMatchObject({
      id,
      name: 'Race talk',
      read_access: 'members',
      write_access: 'organisers',
    });
    expect(await bodies(agent, 'race')).toEqual(['before the rename']);
    expect((await agent.get('/api/chat/favourites')).body.rooms).toContain('race');

    const after = rooms();
    migrateChat(t.db);
    expect(rooms()).toEqual(after);
  });

  it('a race room already there: neither room is touched', () => {
    t = chatApp();
    t.db
      .prepare(
        `INSERT INTO chat_rooms (slug, name, read_access, write_access, guest_writable, position)
         VALUES ('seasonal-race', 'Old race', 'members', 'members', 0, 99)`
      )
      .run();
    const before = rooms();
    migrateChat(t.db);
    expect(rooms()).toEqual(before);
  });
});
