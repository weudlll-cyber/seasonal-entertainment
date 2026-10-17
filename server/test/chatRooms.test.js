// ============================================================
// File:        chatRooms.test.js
// Path:        server/test/chatRooms.test.js
// Project:     Seasonal Entertainment
// Description: Guards the chat room editor (admins only, audited) and the guest-writable flag:
//              guests write only in rooms explicitly marked so, new rooms are not, and an
//              existing database gets the flag without changing who may write today.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { listRooms } from '../src/chat/store.js';
import { openDatabase } from '../src/db/database.js';
import { auditActions, chatApp, post } from './helpers/chat.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

describe('room editor', () => {
  it('admins add and edit rooms (audited); others cannot', async () => {
    t = chatApp();
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const room = { slug: 'quiz', name: 'Quiz', readAccess: 'members', writeAccess: 'members' };
    expect((await organiser.post('/api/admin/chat/rooms').send(room)).status).toBe(403);
    const created = await admin.post('/api/admin/chat/rooms').send(room);
    expect(created.status).toBe(201);
    await admin
      .put(`/api/admin/chat/rooms/${created.body.room.id}`)
      .send({ ...room, readAccess: 'everyone' });
    expect(auditActions(t)).toEqual(['chat.room_create', 'chat.room_edit']);
    expect((await t.client().get('/api/chat/rooms')).body.rooms.map((r) => r.slug)).toContain(
      'quiz'
    );
  });

  // Write access "everyone" alone does not let guests in: the room must say so explicitly.
  it('guests write only in rooms marked guest-writable; new rooms are not', async () => {
    t = chatApp();
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const { agent: member } = await registerUser(t, 'mia');
    const open = { slug: 'lobby', name: 'Lobby', readAccess: 'everyone', writeAccess: 'everyone' };
    const created = (await admin.post('/api/admin/chat/rooms').send(open)).body.room;
    expect(created.guestWritable).toBe(false);
    expect((await post(t.client(), 'lobby', 'hi')).status).toBe(403);
    expect((await post(member, 'lobby', 'hi')).status).toBe(201);
    const guestRooms = (await t.client().get('/api/chat/rooms')).body.rooms;
    expect(guestRooms.find((r) => r.slug === 'lobby').canWrite).toBe(false);

    const edit = (room) => admin.put(`/api/admin/chat/rooms/${created.id}`).send(room);
    expect((await edit({ ...open, writeAccess: 'members', guestWritable: true })).status).toBe(400);
    expect((await edit({ ...open, guestWritable: true })).body.room.guestWritable).toBe(true);
    expect((await post(t.client(), 'lobby', 'hi')).status).toBe(201);
  });

  it('an existing database gets the flag: open rooms stay guest-writable, others not', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'se-migrate-'));
    const file = path.join(dir, 'old.db');
    const old = new Database(file);
    old.exec(`CREATE TABLE chat_rooms (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, read_access TEXT NOT NULL, write_access TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0);
      INSERT INTO chat_rooms (slug, name, read_access, write_access) VALUES
        ('general', 'General', 'everyone', 'everyone'),
        ('announcements', 'Announcements', 'everyone', 'organisers');`);
    old.close();
    const db = openDatabase(file);
    expect(listRooms(db).map((r) => [r.slug, r.guestWritable])).toEqual([
      ['general', true],
      ['announcements', false],
    ]);
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
