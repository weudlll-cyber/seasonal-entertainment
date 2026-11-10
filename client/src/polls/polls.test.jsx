// ============================================================
// File:        polls.test.jsx
// Path:        client/src/polls/polls.test.jsx
// Project:     Seasonal Entertainment
// Description: The Polls page (PollsPage, PollCard, PollVote, PollResults, PollForm;
//              docs/POLLS.md): open polls before ended ones; guests see a sign-in hint and no
//              form; a member's vote sends the chosen answer, the form says when a poll is not
//              anonymous and checks the answer first; results with counts and names; organisers
//              and admins read the written answers, create polls (a warning when free text is
//              on, steps to choose) and end one early; the list reloads on the live "polls"
//              event; who may vote ("Voting from …", team polls), the home box's dropdown
//              vote and the sidebar's dot with its spoken count.
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
  voters: 'members',
  steps: [],
  mayVote: true,
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
        voters: 'members',
        steps: [],
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

describe('who may vote, the home box, the sidebar dot', () => {
  it('a member without the step sees "Voting from …"; a team poll says so', async () => {
    mockApi({
      ...member,
      ...listed([
        {
          ...OPEN,
          voters: 'steps',
          steps: ['Golden', 'Farmer Silver'],
          mayVote: false,
          canVote: false,
          results: null,
        },
        {
          ...OPEN,
          id: 8,
          question: 'Team only?',
          voters: 'team',
          steps: [],
          mayVote: true,
          canVote: false,
          results: null,
        },
      ]),
    });
    await renderApp('/polls');
    const open = await screen.findByRole('list', { name: 'Open polls' });
    expect(open).toHaveTextContent('Voting from Golden or Farmer Silver.');
    expect(open).toHaveTextContent('Organisers and admins only');
  });

  it('the create form limits a poll to Discord steps', async () => {
    const calls = mockApi({
      ...signedIn({ username: 'olga', role: 'organiser' }),
      ...listed([], {
        canManage: true,
        steps: [
          { id: 4, ladder: 'holder', name: 'Golden' },
          { id: 12, ladder: 'farmer', name: 'Farmer Silver' },
        ],
      }),
      'POST /polls': { status: 201, body: { ok: true } },
    });
    await renderApp('/polls');
    fireEvent.click(await screen.findByRole('button', { name: 'New poll' }));
    const form = screen.getByRole('form', { name: 'New poll' });
    fireEvent.change(within(form).getByLabelText('Question'), { target: { value: 'Whales?' } });
    fireEvent.change(within(form).getByLabelText('Answer 1'), { target: { value: 'Yes' } });
    fireEvent.change(within(form).getByLabelText('Answer 2'), { target: { value: 'No' } });
    fireEvent.click(within(form).getByRole('radio', { name: /Members with a Discord step/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Create poll' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Please choose at least one Discord step.'
    );
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Farmer Silver' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Create poll' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /polls')?.body).toMatchObject({
        voters: 'steps',
        steps: [12],
      })
    );
  });

  it('the home box votes with its dropdown; the sidebar dot counts open polls to vote in', async () => {
    const newest = { ...OPEN, mayVote: true, canVote: true, results: null };
    const calls = mockApi({
      ...member,
      'GET /polls/summary': { body: { ok: true, unvoted: 2, newest } },
      'POST /polls/7/vote': { body: { ok: true } },
    });
    await renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      await within(nav).findByRole('link', { name: 'Polls: 2 open polls to vote in' })
    ).toHaveAttribute('href', '/polls');
    const box = await screen.findByRole('region', { name: 'Poll: Which day?' });
    expect(box).toHaveTextContent('Not anonymous: your name is shown.');
    fireEvent.change(within(box).getByRole('combobox', { name: 'Your answer' }), {
      target: { value: '2' },
    });
    fireEvent.click(within(box).getByRole('button', { name: 'Vote' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /polls/7/vote')?.body).toEqual({
        options: [2],
        text: '',
      })
    );
  });
});
