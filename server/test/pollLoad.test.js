// ============================================================
// File:        pollLoad.test.js
// Path:        server/test/pollLoad.test.js
// Project:     Seasonal Entertainment
// Description: The polls' load (security review of 2026-11-13, L4; docs/POLLS.md): the "polls"
//              event at most once a second with the last change still delivered
//              (polls/changes.js); the summary reading only open polls and answering exactly
//              as the earlier reading of every poll did, for guests, members, a member who may
//              not read a poll's room, and the team; the polls page's archive in pages of 20
//              (?from=<id>, next) with open polls always all shown and a call's list unpaged.
// ============================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { callApp, liveCall } from './helpers/calls.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { WINDOW_MS, pollsChanged } from '../src/polls/changes.js';
import { ENDED_PAGE, pollSummary } from '../src/polls/lists.js';
import {
  castVote,
  createPoll,
  endPoll,
  findPoll,
  seesPoll,
  shownPoll,
} from '../src/polls/store.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
let server;
let socket;
afterEach(async () => {
  vi.useRealTimers();
  // Closed here, not at the test's end: a failing test's open socket would hold the server.
  socket?.ws.close();
  socket = null;
  await stopServer(server);
  server = null;
  t?.close();
});

const HOUR = 3_600_000;
const POLL = {
  question: 'Which day suits you?',
  kind: 'choice',
  options: ['Friday', 'Saturday'],
  multiple: false,
  otherText: false,
  results: 'after_vote',
  anonymous: false,
  voters: 'members',
  endsAt: null,
};
// A poll straight into the store (no rate limit, no event); returns its id.
const make = (db, userId, extra = {}) => createPoll(db, { ...POLL, ...extra }, { id: userId });
const ended = (db, userId, extra) => {
  const id = make(db, userId, extra);
  endPoll(db, id);
  return id;
};

describe('the polls event', () => {
  it('a burst of changes inside a second makes one event, after the last change', () => {
    vi.useFakeTimers();
    const sent = [];
    const chat = { notify: { members: (event) => sent.push(event) } };
    for (let i = 0; i < 10; i += 1) {
      pollsChanged(chat);
      vi.advanceTimersByTime(90);
    }
    // 900 ms of changes: nothing yet, the window is still open.
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(WINDOW_MS - 900);
    expect(sent).toEqual([{ type: 'polls' }]);
    // A change after the window: its own event a second later, none before.
    pollsChanged(chat);
    vi.advanceTimersByTime(WINDOW_MS - 1);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(2);
  });

  it("each chat handle has its own window (one per app; a call's end shares it)", () => {
    vi.useFakeTimers();
    const sent = [];
    const one = { notify: { members: () => sent.push('one') } };
    const two = { notify: { members: () => sent.push('two') } };
    pollsChanged(one);
    pollsChanged(two);
    pollsChanged(one);
    vi.advanceTimersByTime(WINDOW_MS);
    expect(sent.sort()).toEqual(['one', 'two']);
  });

  it("members' open pages get one event for many votes, and it comes after the last", async () => {
    let url;
    ({ t, server, url } = await listeningChat());
    const olga = await makeStaff(t, 'olga', 'organiser');
    const voters = await Promise.all(['mia', 'ben', 'kim'].map((name) => registerUser(t, name)));
    const id = make(t.db, olga.user.id);
    const optionId = findPoll(t.db, id).options[0].id;
    socket = connect(url, { cookie: cookieOf(voters[0].agent) });
    await socket.opened;
    for (const { agent } of voters) {
      expect((await agent.post(`/api/polls/${id}/vote`).send({ options: [optionId] })).status).toBe(
        200
      );
    }
    await socket.next('polls');
    // Every vote was counted before the event went out: a page reloading now sees all three.
    expect((await voters[0].agent.get(`/api/polls/${id}`)).body.poll.votes).toBe(3);
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 200));
    expect(socket.events.filter((e) => e.type === 'polls')).toHaveLength(1);
  });
});

// Today's summary before this change: every poll ever made read and shown, then filtered.
function summaryOverEveryPoll(db, viewer, at) {
  const open = db
    .prepare('SELECT id FROM polls ORDER BY id DESC')
    .all()
    .map(({ id }) => findPoll(db, id))
    .filter((poll) => seesPoll(poll, viewer))
    .map((poll) => shownPoll(db, poll, viewer, at))
    .filter((p) => p.open);
  const newest = open.reduce((a, b) => (!a || b.id > a.id ? b : a), null);
  return { unvoted: open.filter((p) => p.canVote && !p.voted).length, newest };
}

describe('the summary', () => {
  it('reads only open polls and answers as reading every poll did', async () => {
    ({ t } = callApp());
    const olga = await makeStaff(t, 'olga', 'organiser');
    const mia = await registerUser(t, 'mia');
    const { db } = t;
    const room = db.prepare('SELECT id FROM chat_rooms ORDER BY id LIMIT 1').get().id;
    const at = Date.now();
    const open = make(db, olga.user.id);
    make(db, olga.user.id, { endsAt: new Date(at + HOUR).toISOString(), results: 'after_end' });
    // Its end time passed but nobody ended it: ended all the same.
    const expired = make(db, olga.user.id);
    db.prepare('UPDATE polls SET ends_at = ? WHERE id = ?').run(
      new Date(at - 1000).toISOString(),
      expired
    );
    ended(db, olga.user.id);
    make(db, olga.user.id, { voters: 'team' });
    const roomPoll = make(db, olga.user.id, { roomId: room });
    ended(db, olga.user.id, { voters: 'team' });
    castVote(db, findPoll(db, open), mia.user.id, { options: [findPoll(db, open).options[0].id] });

    const viewers = {
      guest: { userId: null, team: false, steps: [], readsRoom: () => true },
      mia: { userId: mia.user.id, team: false, steps: [], readsRoom: () => true },
      'mia outside the room': {
        userId: mia.user.id,
        team: false,
        steps: [],
        readsRoom: (id) => id !== room,
      },
      olga: { userId: olga.user.id, team: true, steps: [], readsRoom: () => true },
    };
    for (const [who, viewer] of Object.entries(viewers)) {
      expect(pollSummary(db, viewer, at), who).toEqual(summaryOverEveryPoll(db, viewer, at));
    }
    // The mix tells the viewers apart: the room poll is the newest only for those who read it.
    expect(pollSummary(db, viewers.mia, at).newest.id).toBe(roomPoll);
    expect(pollSummary(db, viewers['mia outside the room'], at).newest.id).not.toBe(roomPoll);
    expect(pollSummary(db, viewers.mia, at).unvoted).toBe(2);
    expect(pollSummary(db, viewers.olga, at).unvoted).toBe(4);

    // Only open polls are read in full: ended ones are never looked up.
    const statements = [];
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => (statements.push(sql), prepare(sql));
    pollSummary(db, viewers.olga, at);
    db.prepare = prepare;
    const lookups = statements.filter((sql) => sql.includes('WHERE p.id = ?')).length;
    expect(lookups).toBe(4);
  });
});

describe('the archive', () => {
  async function page(agent, from) {
    const res = await agent.get(from === undefined ? '/api/polls' : `/api/polls?from=${from}`);
    const polls = res.body.polls;
    return {
      open: polls.filter((p) => p.open).map((p) => p.id),
      ended: polls.filter((p) => !p.open).map((p) => p.id),
      next: res.body.next,
    };
  }

  it('comes 20 at a time, newest first, with every open poll on every page', async () => {
    ({ t } = callApp());
    const olga = await makeStaff(t, 'olga', 'organiser');
    const mia = await registerUser(t, 'mia');
    const seen = [];
    const team = [];
    for (let i = 0; i < 45; i += 1) {
      seen.push(ended(t.db, olga.user.id));
      // Ended team polls in between: a member's pages count only what the member sees.
      if (i % 10 === 5) team.push(ended(t.db, olga.user.id, { voters: 'team' }));
    }
    const open = [1, 2, 3].map(() => make(t.db, olga.user.id));
    const newestFirst = [...seen].reverse();

    const first = await page(mia.agent);
    expect(ENDED_PAGE).toBe(20);
    expect(first.open).toEqual([...open].reverse());
    expect(first.ended).toEqual(newestFirst.slice(0, 20));
    // next: the oldest poll of the following page.
    expect(first.next).toBe(newestFirst[39]);
    const second = await page(mia.agent, first.next);
    expect(second.open).toHaveLength(3);
    expect(second.ended).toEqual(newestFirst.slice(0, 40));
    expect(second.next).toBe(newestFirst[44]);
    const last = await page(mia.agent, second.next);
    expect(last.ended).toEqual(newestFirst);
    expect(last.next).toBeNull();

    // The team sees its own polls in the archive too.
    expect((await page(olga.agent, newestFirst[44])).ended).toHaveLength(45 + team.length);
  });

  it('at exactly 20 there is no next page, at 21 one more; nothing ended: none', async () => {
    ({ t } = callApp());
    const olga = await makeStaff(t, 'olga', 'organiser');
    const ids = [];
    expect((await page(olga.agent)).next).toBeNull();
    for (let i = 0; i < 20; i += 1) ids.push(ended(t.db, olga.user.id));
    expect(await page(olga.agent)).toEqual({ open: [], ended: [...ids].reverse(), next: null });
    const oldest = ids[0];
    ids.push(ended(t.db, olga.user.id));
    const first = await page(olga.agent);
    expect(first.ended).toHaveLength(20);
    expect(first.ended).not.toContain(oldest);
    expect(first.next).toBe(oldest);
    expect((await page(olga.agent, first.next)).ended).toEqual([...ids].reverse());
  });

  it('a reload keeps the loaded pages, adds a newly ended poll, drops a deleted one', async () => {
    ({ t } = callApp());
    const olga = await makeStaff(t, 'olga', 'organiser');
    const ids = [];
    for (let i = 0; i < 30; i += 1) ids.push(ended(t.db, olga.user.id));
    const open = make(t.db, olga.user.id);
    const loaded = await page(olga.agent, (await page(olga.agent)).next);
    expect(loaded.ended).toHaveLength(30);

    endPoll(t.db, open);
    t.db.prepare('DELETE FROM polls WHERE id = ?').run(ids[15]);
    const reloaded = await page(olga.agent, ids[0]);
    expect(reloaded.open).toEqual([]);
    expect(reloaded.ended).toEqual([open, ...[...ids].reverse().filter((id) => id !== ids[15])]);
  });

  it("a call's own list is not paged", async () => {
    ({ t } = callApp());
    const olga = await makeStaff(t, 'olga', 'organiser');
    const call = await liveCall(olga.agent, 'Town hall');
    for (let i = 0; i < 25; i += 1) ended(t.db, olga.user.id, { callId: call.id });
    const res = await olga.agent.get(`/api/polls?call=${call.id}`);
    expect(res.body.polls).toHaveLength(25);
    expect(res.body.next).toBeUndefined();
  });
});
