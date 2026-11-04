// ============================================================
// File:        discordRoomsRecheck.test.js
// Path:        server/test/discordRoomsRecheck.test.js
// Project:     Seasonal Entertainment
// Description: Admin changes to who may read a room for Discord steps reach open chat sockets
//              at once (chat/hub.js recheckAllRooms; docs/CHAT.md, "Rooms for Discord steps"):
//              a room's step rule, a step's role id and the ladder order. A member who lost the
//              room is told "not_allowed" and gets no more of its messages; every connected
//              member hears "access" and finds a room they gained in their list.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { post } from './helpers/chat.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { DISCORD_TEST } from './helpers/fakeDiscord.js';
import { seedTestSteps } from './helpers/steps.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
let server;
const sockets = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.ws.close();
  await stopServer(server);
  server = null;
  t?.close();
});

const GOLDEN = '1110000000000000004';
const SILVER = '1110000000000000003';
const FARMER_SILVER = '1120000000000000003';

const stepId = (name) => t.db.prepare('SELECT id FROM discord_steps WHERE name = ?').get(name).id;
const map = (name, roleId) =>
  t.db.prepare('UPDATE discord_steps SET role_id = ? WHERE name = ?').run(roleId, name);

function link(userId, roleIds) {
  t.db
    .prepare(
      `INSERT INTO discord_links (user_id, discord_id, discord_name, status, role_ids, linked_at, next_refresh_at)
       VALUES (?, ?, 'd', 'member', ?, 'now', 'later')`
    )
    .run(userId, String(400000000000000000n + BigInt(userId)), JSON.stringify(roleIds));
}

// Whales opens from Golden (Holder) or Farmer Silver. Bert (Golden) and Cleo (Silver) are
// connected, Bert reading Whales.
async function setup() {
  ({ t, server } = await listeningChat({ discord: DISCORD_TEST }));
  const url = `ws://127.0.0.1:${server.address().port}/ws/chat`;
  await seedTestSteps(t.db);
  map('Golden', GOLDEN);
  map('Silver', SILVER);
  map('Farmer Silver', FARMER_SILVER);
  const { agent: admin } = await makeStaff(t, 'boss', 'admin');
  const room = {
    slug: 'whales',
    name: 'Whales',
    readAccess: 'members',
    writeAccess: 'members',
    stepIds: [stepId('Golden'), stepId('Farmer Silver')],
  };
  const created = await admin.post('/api/admin/chat/rooms').send(room);
  expect(created.status).toBe(201);
  const people = {};
  for (const [name, roles] of [
    ['bert', [GOLDEN]],
    ['cleo', [SILVER]],
    ['dora', [FARMER_SILVER]],
  ]) {
    people[name] = await registerUser(t, name);
    link(people[name].user.id, roles);
    people[name].socket = connect(url, { cookie: cookieOf(people[name].agent) });
    sockets.push(people[name].socket);
    await people[name].socket.opened;
  }
  expect((await people.bert.socket.subscribe('whales')).type).toBe('subscribed');
  return { admin, people, room, roomId: created.body.room.id };
}

const roomSlugs = async (agent) =>
  (await agent.get('/api/chat/rooms')).body.rooms.map((r) => r.slug);

// Bert lost Whales: told so at once, and its messages no longer reach him.
async function expectLost(people) {
  expect(await people.bert.socket.next('error')).toMatchObject({
    error: 'not_allowed',
    room: 'whales',
  });
  expect(await people.bert.socket.next('access')).toBeTruthy();
  expect((await post(people.dora.agent, 'whales', 'after')).status).toBe(201);
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(people.bert.socket.events.some((e) => e.type === 'message')).toBe(false);
}

// Cleo gained Whales: her page hears "access", and the reloaded list has it.
async function expectGained(people) {
  expect(await people.cleo.socket.next('access')).toBeTruthy();
  expect(await roomSlugs(people.cleo.agent)).toContain('whales');
  expect((await people.cleo.socket.subscribe('whales')).type).toBe('subscribed');
}

describe('admin changes reach open connections at once', () => {
  it('a room rule: lost and gained', async () => {
    const { admin, people, room, roomId } = await setup();
    expect(await roomSlugs(people.cleo.agent)).not.toContain('whales');
    const res = await admin
      .put(`/api/admin/chat/rooms/${roomId}`)
      .send({ ...room, stepIds: [stepId('Silver'), stepId('Farmer Silver')] });
    expect(res.status).toBe(200);
    await expectGained(people);
    // Golden is above Silver: Bert keeps it.
    expect(people.bert.socket.events.some((e) => e.type === 'error')).toBe(false);
    await admin
      .put(`/api/admin/chat/rooms/${roomId}`)
      .send({ ...room, stepIds: [stepId('Farmer Silver')] });
    await expectLost(people);
  });

  it("a step's role id: lost and gained", async () => {
    const { admin, people } = await setup();
    // Cleo's role becomes Golden; Bert's role id now belongs to no step.
    map('Silver', null);
    const res = await admin
      .put(`/api/admin/discord/steps/${stepId('Golden')}`)
      .send({ name: 'Golden', roleId: SILVER });
    expect(res.status).toBe(200);
    await expectLost(people);
    await expectGained(people);
  });

  it('the ladder order: gained', async () => {
    const { admin, people } = await setup();
    const ids = t.db
      .prepare("SELECT id FROM discord_steps WHERE ladder = 'holder' ORDER BY position")
      .all()
      .map((r) => r.id);
    // Silver moves to the top of the Holder ladder, above Golden.
    const order = [...ids.filter((id) => id !== stepId('Silver')), stepId('Silver')];
    const res = await admin.post('/api/admin/discord/ladders/holder/order').send({ ids: order });
    expect(res.status).toBe(200);
    await expectGained(people);
  });
});
