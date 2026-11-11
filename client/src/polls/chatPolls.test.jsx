// ============================================================
// File:        chatPolls.test.jsx
// Path:        client/src/polls/chatPolls.test.jsx
// Project:     Seasonal Entertainment
// Description: Polls in a chat room (chat/ChatPanel.jsx, chat/ChatMessage.jsx, ChatPollCard,
//              PollForm with a room; docs/POLLS.md, "Polls in chat rooms"): a message naming a
//              poll shows its card, voted in place; organisers and admins get "Poll" beside
//              the composer, which opens the form and sends the poll with the room; members
//              do not get it; a deleted poll's card says so.
// ============================================================

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const POLL = {
  id: 4,
  question: 'Pizza or pasta?',
  kind: 'choice',
  multiple: false,
  otherText: false,
  resultsWhen: 'after_vote',
  anonymous: false,
  voters: 'members',
  steps: [],
  roomSlug: 'general',
  roomName: 'General',
  open: true,
  endsAt: null,
  endedAt: null,
  createdBy: 'olga',
  votes: 0,
  voted: false,
  mayVote: true,
  canVote: true,
  myVote: null,
  results: null,
  options: [
    { id: 1, label: 'Pizza' },
    { id: 2, label: 'Pasta' },
  ],
};
const CARD = {
  id: 30,
  room: 'general',
  author: 'olga',
  authorRole: 'organiser',
  isGuest: false,
  isSystem: false,
  kind: 'text',
  body: '',
  pollId: 4,
  createdAt: '2026-11-11T18:00:00.000Z',
  hiddenAt: null,
};
const room = (
  moderator,
  poll = { body: { ok: true, canManage: moderator, canDelete: false, poll: POLL } }
) => ({
  'GET /chat/rooms': {
    body: {
      ok: true,
      rooms: [{ slug: 'general', name: 'General', canWrite: true }],
      me: { guestName: null, moderator },
    },
  },
  'GET /chat/rooms/general/messages': { body: { ok: true, messages: [CARD] } },
  'GET /polls/4': poll,
});

it("a poll's card in the timeline is voted in place; members get no Poll button", async () => {
  const calls = mockApi({
    ...signedIn({ username: 'mia', role: 'member' }),
    ...room(false),
    'POST /polls/4/vote': { body: { ok: true } },
  });
  await renderApp('/chat');
  const card = await screen.findByRole('list', { name: 'Poll' });
  expect(within(card).getByRole('heading', { name: 'Pizza or pasta?' })).toBeInTheDocument();
  fireEvent.click(within(card).getByRole('radio', { name: 'Pasta' }));
  fireEvent.click(within(card).getByRole('button', { name: 'Vote' }));
  await waitFor(() =>
    expect(calls.find((c) => c.key === 'POST /polls/4/vote')?.body).toEqual({
      options: [2],
      text: '',
    })
  );
  expect(screen.queryByRole('button', { name: 'Poll' })).toBeNull();
});

it('organisers start a poll in the room from beside the composer', async () => {
  const calls = mockApi({
    ...signedIn({ username: 'olga', role: 'organiser' }),
    ...room(true),
    'POST /polls': { status: 201, body: { ok: true } },
  });
  await renderApp('/chat');
  fireEvent.click(await screen.findByRole('button', { name: 'Poll' }));
  const form = screen.getByRole('form', { name: 'New poll' });
  fireEvent.change(within(form).getByLabelText('Question'), { target: { value: 'Lunch?' } });
  fireEvent.change(within(form).getByLabelText('Answer 1'), { target: { value: 'Yes' } });
  fireEvent.change(within(form).getByLabelText('Answer 2'), { target: { value: 'No' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Create poll' }));
  await waitFor(() =>
    expect(calls.find((c) => c.key === 'POST /polls')?.body).toMatchObject({
      question: 'Lunch?',
      room: 'general',
    })
  );
});

it("a deleted poll's card says so", async () => {
  mockApi({
    ...signedIn({ username: 'mia', role: 'member' }),
    ...room(false, { status: 404, body: { ok: false, message: 'No such poll.' } }),
  });
  await renderApp('/chat');
  expect(await screen.findByText('This poll was deleted.')).toBeInTheDocument();
});
