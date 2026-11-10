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
//              ballot stays; members' open pages hear of every change at once; who may vote
//              (Discord steps, team polls) and the summary; a poll started in a live call is
//              listed on its page and ends with the call.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { proof } from './helpers/accountKeys.js';
import { callApp, liveCall, newCall } from './helpers/calls.js';
import { auditActions } from './helpers/chat.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { seedTestSteps } from './helpers/steps.js';
import { dropEndedLinks } from '../src/polls/store.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

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
  voters: 'members',
  endsAt: null,
};

// An app with the stand-in call service (calls/ helpers), for the polls started in a call.
async function setup() {
  ({ t } = callApp());
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

it('lists open polls newest first, then ended ones newest first', async () => {
  const { olga, mia } = await setup();
  const soon = await create(olga, { ...CHOICE, endsAt: later(60_000) });
  const late = await create(olga, { ...CHOICE, endsAt: later(5 * HOUR) });
  const ended = await create(olga, CHOICE);
  await olga.post(`/api/polls/${ended.id}/end`);
  // The older poll ends sooner, yet the newest comes first (decided 2026-11-11).
  expect((await list(mia)).polls.map((p) => p.id)).toEqual([late.id, soon.id, ended.id]);
  expect((await shown(mia, soon.id)).resultsWhen).toBe('after_vote');
});

describe('who may vote', () => {
  // Golden (Holder ladder) mapped to a Discord role; links an account holding these roles.
  const GOLDEN = '1110000000000000004';
  const PLATINUM = '1110000000000000005';
  const stepId = (name) => t.db.prepare('SELECT id FROM discord_steps WHERE name = ?').get(name).id;
  function link(userId, roleIds) {
    t.db
      .prepare(
        `INSERT INTO discord_links (user_id, discord_id, discord_name, status, role_ids, linked_at,
           next_refresh_at) VALUES (?, ?, 'd', 'member', ?, 'now', 'later')`
      )
      .run(userId, String(400000000000000000n + BigInt(userId)), JSON.stringify(roleIds));
  }

  it('a step poll: that step or a higher one in its ladder; everyone sees it', async () => {
    const { olga, mia, ben } = await setup();
    await seedTestSteps(t.db);
    t.db.prepare('UPDATE discord_steps SET role_id = ? WHERE name = ?').run(GOLDEN, 'Golden');
    t.db.prepare('UPDATE discord_steps SET role_id = ? WHERE name = ?').run(PLATINUM, 'Platinum');
    const { user: kim, agent: kimAgent } = await registerUser(t, 'kim');
    link(kim.id, [PLATINUM]);
    const unknown = await olga
      .post('/api/polls')
      .send({ ...CHOICE, voters: 'steps', steps: [9999] });
    expect(unknown.body.message).toBe('Please choose among the Discord steps.');

    const poll = await create(olga, { ...CHOICE, voters: 'steps', steps: [stepId('Golden')] });
    expect(poll).toMatchObject({ voters: 'steps', steps: ['Golden'] });
    expect(poll.stepRule).toBeUndefined();
    const [friday] = optionIds(poll);
    // Mia has no step: she sees the poll and why she cannot vote.
    expect(await shown(mia, poll.id)).toMatchObject({ mayVote: false, canVote: false });
    const refused = await vote(mia, poll.id, { options: [friday] });
    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe('Voting from Golden.');
    // Kim holds Platinum, higher in the same ladder; the organiser always may.
    expect((await vote(kimAgent, poll.id, { options: [friday] })).status).toBe(200);
    expect((await vote(olga, poll.id, { options: [friday] })).status).toBe(200);
    expect((await shown(t.client(), poll.id)).question).toBe(CHOICE.question);
    expect((await shown(ben, poll.id)).mayVote).toBe(false);
  });

  it('a team poll: only organisers and admins see it and vote', async () => {
    const { olga, mia } = await setup();
    const poll = await create(olga, { ...CHOICE, voters: 'team' });
    expect(await shown(mia, poll.id)).toBeUndefined();
    expect(await shown(t.client(), poll.id)).toBeUndefined();
    expect((await vote(mia, poll.id, { options: optionIds(poll).slice(0, 1) })).status).toBe(404);
    expect((await shown(olga, poll.id)).canVote).toBe(true);
    expect((await mia.get('/api/polls/summary')).body).toEqual({
      ok: true,
      unvoted: 0,
      newest: null,
    });
  });

  it('the summary counts the open polls not yet voted in, and names the newest', async () => {
    const { olga, mia } = await setup();
    const first = await create(olga, CHOICE);
    const second = await create(olga, CHOICE);
    let summary = (await mia.get('/api/polls/summary')).body;
    expect(summary.unvoted).toBe(2);
    expect(summary.newest.id).toBe(second.id);
    await vote(mia, first.id, { options: optionIds(first).slice(0, 1) });
    await olga.post(`/api/polls/${second.id}/end`);
    summary = (await mia.get('/api/polls/summary')).body;
    expect(summary.unvoted).toBe(0);
    expect(summary.newest.id).toBe(first.id);
    expect((await t.client().get('/api/polls/summary')).body.unvoted).toBe(0);
  });
});

describe('anonymous polls', () => {
  const links = () => t.db.prepare('SELECT COUNT(*) AS n FROM poll_ballot_links').get().n;

  it('name nobody; results after the vote: the first vote stays; switch before the first vote', async () => {
    const { olga, mia } = await setup();
    const poll = await create(olga, { ...CHOICE, anonymous: false });
    expect(
      (await olga.post(`/api/polls/${poll.id}/anonymous`).send({ anonymous: true })).status
    ).toBe(200);
    const [friday, saturday] = optionIds(poll);
    await vote(mia, poll.id, { options: [friday], text: '' });
    expect((await vote(mia, poll.id, { options: [saturday] })).status).toBe(409);
    expect(t.db.prepare('SELECT user_id FROM poll_ballots').all()).toEqual([{ user_id: null }]);
    // Results right after the vote: no link is kept at all.
    expect(links()).toBe(0);
    expect((await shown(olga, poll.id)).results.options[0]).toEqual({ id: friday, count: 1 });
    expect((await shown(mia, poll.id)).myVote).toBeNull();
    const locked = await olga.post(`/api/polls/${poll.id}/anonymous`).send({ anonymous: false });
    expect(locked.status).toBe(409);
  });

  it('results after the end: the vote changes until the end; no answer carries the link', async () => {
    const { olga, mia } = await setup();
    const poll = await create(olga, { ...CHOICE, results: 'after_end', anonymous: true });
    const [friday, saturday] = optionIds(poll);
    const first = await vote(mia, poll.id, { options: [friday] });
    expect(first.body.poll).toMatchObject({ voted: true, canVote: true, myVote: null });
    const changed = await vote(mia, poll.id, { options: [saturday] });
    expect(changed.status).toBe(200);
    expect(links()).toBe(1);
    expect(t.db.prepare('SELECT user_id FROM poll_ballots').all()).toEqual([{ user_id: null }]);
    // Nothing the API answers names the link or a ballot (vote, list, summary, as staff too).
    const answers = [
      first.text,
      changed.text,
      (await mia.get('/api/polls')).text,
      (await olga.get('/api/polls')).text,
      (await mia.get('/api/polls/summary')).text,
    ];
    for (const text of answers) expect(text).not.toMatch(/ballot|link/i);
    await olga.post(`/api/polls/${poll.id}/end`);
    expect(links()).toBe(0);
    expect((await shown(olga, poll.id)).results.options.map((o) => o.count)).toEqual([0, 1, 0]);
  });

  it('the links go however the poll ends: its end time, its call', async () => {
    const { olga, mia, ben } = await setup();
    const timed = await create(olga, {
      ...CHOICE,
      results: 'after_end',
      anonymous: true,
      endsAt: later(60_000),
    });
    await vote(mia, timed.id, { options: optionIds(timed).slice(0, 1) });
    expect(links()).toBe(1);
    // Its end time passes: the polls job's sweep (dropEndedLinks) takes the link.
    dropEndedLinks(t.db, Date.now() + 120_000);
    expect(links()).toBe(0);

    const call = await liveCall(olga, 'Town hall');
    const inCall = await create(olga, {
      ...CHOICE,
      results: 'after_end',
      anonymous: true,
      callId: call.id,
    });
    await vote(ben, inCall.id, { options: optionIds(inCall).slice(0, 1) });
    expect(links()).toBe(1);
    await olga.post(`/api/calls/${call.id}/end`);
    expect(links()).toBe(0);
  });

  it('an account deleted before the end takes its anonymous ballot and text; after, it stays', async () => {
    const { olga } = await setup();
    const { agent: kim } = await registerUser(t, 'kim');
    const { agent: lea } = await registerUser(t, 'lea');
    const open = await create(olga, {
      ...CHOICE,
      results: 'after_end',
      anonymous: true,
      otherText: true,
    });
    const ended = await create(olga, { ...CHOICE, results: 'after_end', anonymous: true });
    await vote(kim, open.id, { text: 'Monday' });
    await vote(lea, ended.id, { options: optionIds(ended).slice(0, 1) });
    await olga.post(`/api/polls/${ended.id}/end`);
    for (const agent of [kim, lea]) {
      expect(
        (await agent.delete('/api/auth/account').send(await proof('correct-horse-1'))).status
      ).toBe(200);
    }
    expect((await shown(olga, open.id)).results).toMatchObject({ textCount: 0, texts: [] });
    expect((await shown(olga, open.id)).votes).toBe(0);
    // Ended before the deletion: the ballot names nobody and stays.
    expect((await shown(olga, ended.id)).votes).toBe(1);
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

describe('polls in a call', () => {
  it('start only in a live call, are listed on its page, and end with the call', async () => {
    ({ t } = callApp());
    const olga = (await makeStaff(t, 'olga', 'organiser')).agent;
    const { agent: mia } = await registerUser(t, 'mia');
    const planned = await newCall(olga, 'Later');
    const early = await olga.post('/api/polls').send({ ...CHOICE, callId: planned.id });
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('call_not_live');

    const call = await liveCall(olga, 'Town hall');
    const inCall = await create(olga, { ...CHOICE, callId: call.id, endsAt: later(60_000) });
    expect(inCall).toMatchObject({ callId: call.id, callTitle: 'Town hall' });
    await create(olga, CHOICE);
    const onPage = (await mia.get(`/api/polls?call=${call.id}`)).body.polls;
    expect(onPage.map((p) => p.id)).toEqual([inCall.id]);
    expect((await list(mia)).polls).toHaveLength(2);

    expect((await olga.post(`/api/calls/${call.id}/end`)).status).toBe(200);
    expect((await shown(mia, inCall.id)).open).toBe(false);
    expect((await vote(mia, inCall.id, { options: optionIds(inCall).slice(0, 1) })).status).toBe(
      409
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

it('an older polls table (an earlier state of the branch) is brought up to date on start', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'se-polls-'));
  const file = path.join(dir, 'old.db');
  try {
    let db = openDatabase(file);
    // The first polls table: without voters, call_id and room_id.
    db.exec(`DROP TABLE poll_step_rules; DROP TABLE poll_ballot_links; DROP TABLE poll_voters;
      DROP TABLE poll_ballot_options; DROP TABLE poll_ballots; DROP TABLE poll_options;
      DROP TABLE polls;
      CREATE TABLE polls (id INTEGER PRIMARY KEY, question TEXT NOT NULL, kind TEXT NOT NULL,
        multiple INTEGER NOT NULL DEFAULT 0, other_text INTEGER NOT NULL DEFAULT 0,
        results TEXT NOT NULL, anonymous INTEGER NOT NULL, ends_at TEXT, ended_at TEXT,
        created_by INTEGER, created_at TEXT NOT NULL);`);
    db.close();
    db = openDatabase(file);
    const columns = db
      .prepare('PRAGMA table_info(polls)')
      .all()
      .map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['voters', 'call_id', 'room_id']));
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
