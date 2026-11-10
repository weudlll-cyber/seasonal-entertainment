// ============================================================
// File:        polls.test.jsx
// Path:        client/src/polls/polls.test.jsx
// Project:     Seasonal Entertainment
// Description: The Polls page (PollsPage, PollCard, PollVote, PollResults, PollForm;
//              docs/POLLS.md): open polls before ended ones; guests see a sign-in hint and no
//              form; a member's vote sends the chosen answer, the form says when a poll is not
//              anonymous and checks the answer first; results with counts and names; organisers
//              and admins read the written answers, create polls (a warning when free text is
//              on) and end one early; the list reloads on the live "polls" event.
// ============================================================

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const base = {
  kind: 'choice',
  multiple: false,
  otherText: false,
  results: 'after_vote',
  anonymous: false,
  endsAt: null,
  endedAt: null,
  createdBy: 'olga',
  createdAt: '2026-11-10T18:00:00Z',
  options: [
    { id: 1, label: 'Friday' },
    { id: 2, label: 'Saturday' },
  ],
};
const OPEN = { ...base, id: 7, question: 'Which day?', open: true, votes: 0, voted: false };
const ENDED = {
  ...base,
  id: 3,
  question: 'Best game?',
  open: false,
  endedAt: '2026-11-01T18:00:00Z',
  votes: 3,
  voted: false,
  canVote: false,
  myVote: null,
  results: {
    options: [
      { id: 1, count: 2, voters: ['ben', 'mia'] },
      { id: 2, count: 1, voters: ['kim'] },
    ],
    textCount: 0,
  },
};
const listed = (polls, extra = {}) => ({
  'GET /polls': { body: { ok: true, canManage: false, canDelete: false, polls, ...extra } },
});
const member = signedIn({ username: 'mia', role: 'member' });

describe('the Polls page', () => {
  it('shows open polls first, then ended ones with their results; guests get a hint', async () => {
    mockApi({ ...GUEST, ...listed([{ ...OPEN, canVote: false, results: null }, ENDED]) });
    await renderApp('/polls');
    const open = await screen.findByRole('list', { name: 'Open polls' });
    expect(within(open).getByRole('heading', { name: 'Which day?' })).toBeInTheDocument();
    expect(within(open).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(within(open).queryByRole('button', { name: 'Vote' })).toBeNull();
    const ended = screen.getByRole('list', { name: 'Ended polls' });
    const results = within(ended).getByRole('group', { name: 'Results: Best game?' });
    expect(results).toHaveTextContent('Friday: 2 (67 %)');
    expect(results).toHaveTextContent('ben, mia');
  });

  it('a member votes; the form names the poll as not anonymous and checks first', async () => {
    const calls = mockApi({
      ...member,
      ...listed([{ ...OPEN, canVote: true, results: null, myVote: null }]),
      'POST /polls/7/vote': { body: { ok: true } },
    });
    await renderApp('/polls');
    const form = await screen.findByRole('form', { name: 'Vote: Which day?' });
    expect(form).toHaveTextContent('This poll is not anonymous – your name will be shown.');
    fireEvent.click(within(form).getByRole('button', { name: 'Vote' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Please choose an answer.');
    fireEvent.click(within(form).getByRole('radio', { name: 'Saturday' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Vote' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /polls/7/vote')?.body).toEqual({
        options: [2],
        text: '',
      })
    );
  });

  it('organisers read the written answers and end a poll early', async () => {
    const calls = mockApi({
      ...signedIn({ username: 'olga', role: 'organiser' }),
      ...listed(
        [
          {
            ...OPEN,
            kind: 'text',
            options: [],
            votes: 1,
            canVote: false,
            myVote: null,
            results: { options: [], textCount: 1, texts: [{ text: 'Sunday please', by: 'mia' }] },
          },
        ],
        { canManage: true }
      ),
      'POST /polls/7/end': { body: { ok: true } },
    });
    await renderApp('/polls');
    const texts = await screen.findByRole('list', { name: 'Written answers' });
    expect(texts).toHaveTextContent('Sunday please – mia');
    fireEvent.click(screen.getByRole('button', { name: 'End now' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'POST /polls/7/end')).toBe(true));
  });

  it('organisers create a poll; free text brings the hand-evaluation warning', async () => {
    const calls = mockApi({
      ...signedIn({ username: 'olga', role: 'organiser' }),
      ...listed([], { canManage: true }),
      'POST /polls': { status: 201, body: { ok: true } },
    });
    await renderApp('/polls');
    fireEvent.click(await screen.findByRole('button', { name: 'New poll' }));
    const form = screen.getByRole('form', { name: 'New poll' });
    fireEvent.change(within(form).getByLabelText('Question'), { target: { value: 'Pizza?' } });
    fireEvent.change(within(form).getByLabelText('Answer 1'), { target: { value: 'Yes' } });
    fireEvent.change(within(form).getByLabelText('Answer 2'), { target: { value: 'No' } });
    expect(within(form).queryByRole('note')).toBeNull();
    fireEvent.click(within(form).getByRole('checkbox', { name: /Other answer/ }));
    expect(within(form).getByRole('note')).toHaveTextContent('evaluated by hand');
    fireEvent.click(within(form).getByRole('button', { name: 'Create poll' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /polls')?.body).toEqual({
        question: 'Pizza?',
        kind: 'choice',
        options: ['Yes', 'No'],
        multiple: false,
        otherText: true,
        results: 'after_vote',
        anonymous: false,
        endsAt: null,
      })
    );
  });

  it('reloads on the live "polls" event', async () => {
    const calls = mockApi({ ...member, ...listed([]) });
    await renderApp('/polls');
    await screen.findByText('No open poll at the moment.');
    const before = calls.filter((c) => c.key === 'GET /polls').length;
    await waitFor(() => expect(FakeSocket.all.at(-1)?.readyState).toBe(1));
    FakeSocket.all.at(-1).push({ type: 'polls' });
    await waitFor(() =>
      expect(calls.filter((c) => c.key === 'GET /polls').length).toBeGreaterThan(before)
    );
  });
});
