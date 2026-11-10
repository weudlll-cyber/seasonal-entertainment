// ============================================================
// File:        polls.test.js
// Path:        server/test/polls.test.js
// Project:     Seasonal Entertainment
// Description: Polls (polls/; docs/POLLS.md; decided 2026-11-10): organisers and admins create
//              them (checked, audited), members vote once (guests see but cannot), a vote is
//              changed only where the results show after the end and the poll is not
//              anonymous; results for organisers and admins always, for others after their vote
//              or after the end; free-text answers only for organisers and admins; names per
//              answer only when not anonymous, and an anonymous ballot names nobody; anonymous
//              switches only before the first vote; ending, extending and (admins only)
//              deleting are audited; an account's deletion takes its votes along, an anonymous
//              ballot stays; members' open pages hear of every change at once.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { proof } from './helpers/accountKeys.js';
import { auditActions } from './helpers/chat.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
let server;
afterEach(async () => {
  await stopServer(server);
  server = null;
  t?.close();
});

const HOUR = 3_600_000;
const later = (ms = HOUR) => new Date(Date.now() + ms).toISOString();
const CHOICE = {
  question: 'Which day suits you?',
  kind: 'choice',
  options: ['Friday', 'Saturday', 'Sunday'],
  multiple: false,
  otherText: false,
  results: 'after_vote',
  anonymous: false,
  endsAt: null,
};

async function setup() {
  t = makeTestApp();
  const olga = (await makeStaff(t, 'olga', 'organiser')).agent;
  const mia = (await registerUser(t, 'mia')).agent;
  const ben = (await registerUser(t, 'ben')).agent;
  return { olga, mia, ben };
}
const create = async (agent, poll) => (await agent.post('/api/polls').send(poll)).body.poll;
const list = async (agent) => (await agent.get('/api/polls')).body;
const shown = async (agent, id) => (await list(agent)).polls.find((p) => p.id === id);
const vote = (agent, id, ballot) => agent.post(`/api/polls/${id}/vote`).send(ballot);
const optionIds = (poll) => poll.options.map((o) => o.id);

describe('creating', () => {
  it('only organisers and admins create, the rules are checked, it is audited', async () => {
    const { olga, mia } = await setup();
    expect((await mia.post('/api/polls').send(CHOICE)).status).toBe(403);
    expect((await t.client().post('/api/polls').send(CHOICE)).status).toBe(401);
    const bad = await olga.post('/api/polls').send({ ...CHOICE, options: ['Only one'] });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Please give 2 to 10 answers.');
    const past = await olga.post('/api/polls').send({ ...CHOICE, endsAt: later(-HOUR) });
    expect(past.body.message).toBe('The end must lie in the future.');

    const poll = await create(olga, CHOICE);
    expect(poll).toMatchObject({ question: 'Which day suits you?', open: true, createdBy: 'olga' });
    expect(poll.options.map((o) => o.label)).toEqual(['Friday', 'Saturday', 'Sunday']);
    expect(auditActions(t)).toContain('poll.create');
    // Guests see it too.
    expect((await shown(t.client(), poll.id)).canVote).toBe(false);
  });
});

describe('voting', () => {
  it('one vote per member; results right after the vote; a vote is final then', async () => {
    const { olga, mia, ben } = await setup();
    const poll = await create(olga, CHOICE);
    const [friday, saturday] = optionIds(poll);
    expect((await vote(t.client(), poll.id, { options: [friday] })).status).toBe(401);
    expect((await shown(mia, poll.id)).results).toBeNull();
    expect((await vote(mia, poll.id, { options: [friday, saturday] })).body.message).toBe(
      'Please choose one answer.'
    );

    const voted = (await vote(mia, poll.id, { options: [friday] })).body.poll;
    expect(voted).toMatchObject({ voted: true, canVote: false, votes: 1 });
    expect(voted.myVote).toEqual({ options: [friday], text: '' });
    expect(voted.results.options[0]).toEqual({ id: friday, count: 1, voters: ['mia'] });
    expect((await vote(mia, poll.id, { options: [saturday] })).status).toBe(409);
    // Ben has not voted: no results for him yet; the organiser sees them live.
    expect((await shown(ben, poll.id)).results).toBeNull();
    expect((await shown(olga, poll.id)).results.options[0].count).toBe(1);
  });

  it('results after the end: hidden until then, and a vote may change until the end', async () => {
    const { olga, mia } = await setup();
    const poll = await create(olga, { ...CHOICE, results: 'after_end', multiple: true });
    const [friday, saturday, sunday] = optionIds(poll);
    await vote(mia, poll.id, { options: [friday, saturday] });
    let mine = await shown(mia, poll.id);
    expect(mine).toMatchObject({ voted: true, canVote: true, results: null });
    const changed = await vote(mia, poll.id, { options: [sunday] });
    expect(changed.status).toBe(200);
    expect(changed.body.poll.votes).toBe(1);
    expect(changed.body.poll.myVote.options).toEqual([sunday]);

    expect((await olga.post(`/api/polls/${poll.id}/end`)).status).toBe(200);
    mine = await shown(mia, poll.id);
    expect(mine).toMatchObject({ open: false, canVote: false });
    expect(mine.results.options.map((o) => o.count)).toEqual([0, 0, 1]);
    expect((await vote(mia, poll.id, { options: [friday] })).status).toBe(409);
  });

  it('free text: at most 500 characters, the texts only for organisers and admins', async () => {
    const { olga, mia, ben } = await setup();
    const poll = await create(olga, { ...CHOICE, kind: 'text', options: [] });
    expect((await vote(mia, poll.id, { text: 'x'.repeat(501) })).status).toBe(400);
    expect((await vote(mia, poll.id, { text: ' ' })).body.message).toBe(
      'Please write your answer.'
    );
    await vote(mia, poll.id, { text: 'Saturday evening, please' });
    await vote(ben, poll.id, { text: 'Any day' });
    const member = await shown(mia, poll.id);
    expect(member.results.textCount).toBe(2);
    expect(member.results.texts).toBeUndefined();
    expect((await shown(olga, poll.id)).results.texts).toEqual([
      { text: 'Saturday evening, please', by: 'mia' },
      { text: 'Any day', by: 'ben' },
    ]);
  });

  it('an "Other answer" goes with a choice only where the poll has one', async () => {
    const { olga, mia } = await setup();
    const plain = await create(olga, CHOICE);
    expect((await vote(mia, plain.id, { text: 'Monday' })).body.message).toBe(
      'This poll has no other answer.'
    );
    const other = await create(olga, { ...CHOICE, otherText: true });
    expect((await vote(mia, other.id, { text: 'Monday' })).status).toBe(200);
    expect((await shown(olga, other.id)).results.textCount).toBe(1);
  });
});

describe('anonymous polls', () => {
  it('name nobody, keep the first vote, and switch only before the first vote', async () => {
    const { olga, mia } = await setup();
    const poll = await create(olga, { ...CHOICE, results: 'after_end', anonymous: false });
    expect(
      (await olga.post(`/api/polls/${poll.id}/anonymous`).send({ anonymous: true })).status
    ).toBe(200);
    const [friday, saturday] = optionIds(poll);
    await vote(mia, poll.id, { options: [friday], text: '' });
    // Results after the end, but anonymous: nothing links mia to her ballot, so it stays.
    expect((await shown(mia, poll.id)).canVote).toBe(false);
    expect((await vote(mia, poll.id, { options: [saturday] })).status).toBe(409);
    expect(t.db.prepare('SELECT user_id FROM poll_ballots').all()).toEqual([{ user_id: null }]);
    const results = (await shown(olga, poll.id)).results;
    expect(results.options[0]).toEqual({ id: friday, count: 1 });
    expect((await shown(mia, poll.id)).myVote).toBeNull();
    const locked = await olga.post(`/api/polls/${poll.id}/anonymous`).send({ anonymous: false });
    expect(locked.status).toBe(409);
  });
});

describe('ending, extending, deleting', () => {
  it('organisers end and extend, only admins delete; all audited', async () => {
    const { olga, mia } = await setup();
    const admin = (await makeStaff(t, 'ada', 'admin')).agent;
    const poll = await create(olga, { ...CHOICE, endsAt: later() });
    expect((await mia.post(`/api/polls/${poll.id}/end`)).status).toBe(403);
    const sooner = await olga.post(`/api/polls/${poll.id}/extend`).send({ endsAt: later(60_000) });
    expect(sooner.status).toBe(400);
    const extended = await olga
      .post(`/api/polls/${poll.id}/extend`)
      .send({ endsAt: later(2 * HOUR) });
    expect(extended.status).toBe(200);
    expect(Date.parse((await shown(mia, poll.id)).endsAt)).toBeGreaterThan(Date.now() + HOUR);
    await olga.post(`/api/polls/${poll.id}/end`);
    expect((await olga.post(`/api/polls/${poll.id}/end`)).status).toBe(409);
    // Ended polls stay listed (the archive), after the open ones.
    const second = await create(olga, CHOICE);
    expect((await list(mia)).polls.map((p) => p.id)).toEqual([second.id, poll.id]);

    expect((await olga.delete(`/api/polls/${poll.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/polls/${poll.id}`)).status).toBe(200);
    expect((await list(mia)).polls.map((p) => p.id)).toEqual([second.id]);
    expect(auditActions(t)).toEqual(
      expect.arrayContaining(['poll.create', 'poll.extend', 'poll.end', 'poll.delete'])
    );
  });
});

describe('an account deletion', () => {
  it("takes the account's votes and texts along; an anonymous ballot stays", async () => {
    const { olga } = await setup();
    const { agent: kim } = await registerUser(t, 'kim');
    const named = await create(olga, { ...CHOICE, otherText: true });
    const anonymous = await create(olga, { ...CHOICE, anonymous: true });
    await vote(kim, named.id, { text: 'Monday' });
    await vote(kim, anonymous.id, { options: [optionIds(anonymous)[0]] });

    expect(
      (await kim.delete('/api/auth/account').send(await proof('correct-horse-1'))).status
    ).toBe(200);
    expect((await shown(olga, named.id)).results.textCount).toBe(0);
    expect((await shown(olga, named.id)).votes).toBe(0);
    expect((await shown(olga, anonymous.id)).votes).toBe(1);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM poll_voters').get().n).toBe(0);
  });
});

it("members' open pages hear of every change at once", async () => {
  let url;
  ({ t, server, url } = await listeningChat());
  const olga = (await makeStaff(t, 'olga', 'organiser')).agent;
  const { agent: mia } = await registerUser(t, 'mia');
  const socket = connect(url, { cookie: cookieOf(mia) });
  await socket.opened;
  await create(olga, CHOICE);
  expect(await socket.next('polls')).toEqual({ type: 'polls' });
  socket.ws.close();
});
