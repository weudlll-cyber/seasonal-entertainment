// ============================================================
// File:        discordRooms.test.js
// Path:        server/test/discordRooms.test.js
// Project:     Seasonal Entertainment
// Description: Rooms for Discord steps and the steps beside names (docs/CHAT.md; SE-DISCORD-1
//              piece 4): the admin's room editor takes a rule (one step per ladder, existing
//              steps only); the rule decides reading, writing and the room list (any of its
//              ladders at that step or higher; staff always; guests, accounts without steps and
//              links needing a login never); messages and the member search carry the author's
//              steps from the server; when a member's steps drop, HTTP access ends and their open
//              socket leaves the room at once.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { post } from './helpers/chat.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { seedTestSteps } from './helpers/steps.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
let server;
afterEach(async () => {
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

// Links an account to Discord with these role ids, as a read would have stored them.
function link(userId, roleIds, status = 'member') {
  t.db
    .prepare(
      `INSERT INTO discord_links (user_id, discord_id, discord_name, status, role_ids, linked_at, next_refresh_at)
       VALUES (?, ?, 'd', ?, ?, 'now', 'later')
       ON CONFLICT (user_id) DO UPDATE SET status = excluded.status, role_ids = excluded.role_ids`
    )
    .run(userId, String(400000000000000000n + BigInt(userId)), status, JSON.stringify(roleIds));
}

// A listening app with the steps mapped, a room open from Golden (Holder) or Farmer Silver, and
// members with and without the steps.
async function setup() {
  ({ t, server } = await listeningChat());
  const url = `ws://127.0.0.1:${server.address().port}/ws/chat`;
  await seedTestSteps(t.db);
  map('Golden', GOLDEN);
  map('Silver', SILVER);
  map('Farmer Silver', FARMER_SILVER);
  const { agent: admin } = await makeStaff(t, 'boss', 'admin');
  const created = await admin.post('/api/admin/chat/rooms').send({
    slug: 'whales',
    name: 'Whales',
    readAccess: 'members',
    writeAccess: 'members',
    stepIds: [stepId('Golden'), stepId('Farmer Silver')],
  });
  expect(created.status).toBe(201);
  const people = {};
  for (const [name, roles] of [
    ['anna', null],
    ['bert', [GOLDEN]],
    ['cleo', [SILVER]],
    ['dora', [FARMER_SILVER]],
  ]) {
    people[name] = await registerUser(t, name);
    if (roles) link(people[name].user.id, roles);
  }
  return { url, admin, people };
}

const readStatus = async (agent) => (await agent.get('/api/chat/rooms/whales/messages')).status;
const roomSlugs = async (agent) =>
  (await agent.get('/api/chat/rooms')).body.rooms.map((r) => r.slug);

describe('the room editor', () => {
  it('stores the rule, one step per ladder, existing steps only', async () => {
    const { admin } = await setup();
    const rooms = (await admin.get('/api/admin/chat/rooms')).body.rooms;
    const whales = rooms.find((r) => r.slug === 'whales');
    expect(whales.stepRule.map((s) => s.ladder).sort()).toEqual(['farmer', 'holder']);
    const two = await admin.put(`/api/admin/chat/rooms/${whales.id}`).send({
      slug: 'whales',
      name: 'Whales',
      readAccess: 'members',
      writeAccess: 'members',
      stepIds: [stepId('Golden'), stepId('Silver')],
    });
    expect(two.status).toBe(400);
    const unknown = await admin.put(`/api/admin/chat/rooms/${whales.id}`).send({
      slug: 'whales',
      name: 'Whales',
      readAccess: 'members',
      writeAccess: 'members',
      stepIds: [99999],
    });
    expect(unknown.status).toBe(400);
  });
});

describe('a room for steps', () => {
  it('lets in that step or higher in any of its ladders, and staff', async () => {
    const { admin, people } = await setup();
    expect(await readStatus(people.anna.agent)).toBe(404);
    expect(await readStatus(people.cleo.agent)).toBe(404); // Silver is below Golden
    expect(await readStatus(people.bert.agent)).toBe(200);
    expect(await readStatus(people.dora.agent)).toBe(200); // Farmer Silver: the other ladder
    expect(await readStatus(admin)).toBe(200);
    expect(await readStatus(t.client())).toBe(404);
    expect(await roomSlugs(people.bert.agent)).toContain('whales');
    expect(await roomSlugs(people.cleo.agent)).not.toContain('whales');
    expect((await post(people.bert.agent, 'whales', 'gm whales')).status).toBe(201);
    expect((await post(people.cleo.agent, 'whales', 'let me in')).status).toBe(404);
    // Higher means the order now: move Silver to the top, and Cleo is in.
    const holder = t.db
      .prepare("SELECT id FROM discord_steps WHERE ladder = 'holder' ORDER BY position")
      .all()
      .map((r) => r.id);
    const order = holder.filter((id) => id !== stepId('Silver'));
    order.push(stepId('Silver'));
    order.forEach((id, i) =>
      t.db.prepare('UPDATE discord_steps SET position = ? WHERE id = ?').run(i + 1, id)
    );
    expect(await readStatus(people.cleo.agent)).toBe(200);
  });

  it('is closed to a link that needs a Discord login again', async () => {
    const { people } = await setup();
    link(people.bert.user.id, [GOLDEN], 'needs_login');
    expect(await readStatus(people.bert.agent)).toBe(404);
  });

  it('closes at once when steps drop, also for an open socket', async () => {
    const { url, people } = await setup();
    const bert = connect(url, { cookie: cookieOf(people.bert.agent) });
    await bert.opened;
    expect((await bert.subscribe('whales')).type).toBe('subscribed');
    link(people.bert.user.id, []);
    t.app.locals.chat.sessions.stepsChanged(people.bert.user.id);
    const refused = await bert.next('error');
    expect(refused).toMatchObject({ error: 'not_allowed', room: 'whales' });
    expect(await bert.next('access')).toBeTruthy();
    expect(await readStatus(people.bert.agent)).toBe(404);
    // A message posted now in the room no longer reaches him.
    expect((await post(people.dora.agent, 'whales', 'after')).status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(bert.events.some((e) => e.type === 'message')).toBe(false);
    bert.ws.close();
  });
});

describe('steps beside names', () => {
  it('come with messages and member search results, from the server', async () => {
    const { people } = await setup();
    await post(people.bert.agent, 'general', 'hello');
    const messages = (await people.anna.agent.get('/api/chat/rooms/general/messages')).body
      .messages;
    expect(messages.at(-1).authorSteps).toEqual([{ ladder: 'holder', name: 'Golden', icon: null }]);
    const found = (await people.anna.agent.get('/api/chat/members?q=bert')).body.members;
    expect(found[0].steps).toEqual([{ ladder: 'holder', name: 'Golden', icon: null }]);
    const none = (await people.bert.agent.get('/api/chat/members?q=anna')).body.members;
    expect(none[0].steps).toEqual([]);
    // An uploaded icon travels as its public address.
    const icon = `step-icons/${'a'.repeat(32)}.webp`;
    t.db.prepare("UPDATE discord_steps SET icon_file = ? WHERE name = 'Golden'").run(icon);
    const again = (await people.anna.agent.get('/api/chat/rooms/general/messages')).body.messages;
    expect(again.at(-1).authorSteps[0].icon).toBe(`/media/${icon}`);
  });

  it('ignore anything a client sends', async () => {
    const { people } = await setup();
    await people.anna.agent
      .post('/api/chat/rooms/general/messages')
      .send({ body: 'fake', authorSteps: [{ ladder: 'holder', name: 'Ultimate', icon: null }] });
    const messages = (await people.anna.agent.get('/api/chat/rooms/general/messages')).body
      .messages;
    expect(messages.at(-1).authorSteps).toEqual([]);
  });
});
