// ============================================================
// File:        recordingsArchive.test.jsx
// Path:        client/src/calls/recordingsArchive.test.jsx
// Project:     Seasonal Entertainment
// Description: The recordings archive (/calls/recordings) and chapters (RecordingsPage,
//              RecordingItem, RecordingChapters; docs/CALLS.md, "Recording"): every recording
//              with its call's title linking to the call; the search over the titles; a click
//              on a chapter seeks the player; only organisers and admins see the chapter
//              editing, whose times and titles are checked before anything is sent.
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const RECORDINGS = [
  {
    id: 5,
    callId: 12,
    title: 'AMA with the team',
    startedAt: '2026-10-22T18:00:00Z',
    seconds: 1800,
    chapters: [
      { id: 1, at: 0, title: 'Welcome' },
      { id: 2, at: 750, title: 'Questions' },
    ],
  },
  {
    id: 3,
    callId: 9,
    title: 'Town hall',
    startedAt: '2026-10-15T18:00:00Z',
    seconds: 600,
    chapters: [],
  },
];
const archive = (canManage) => ({
  'GET /calls/recordings': { body: { ok: true, canManage, recordings: RECORDINGS } },
});

describe('the archive', () => {
  it('lists every recording with its call, and searches the titles', async () => {
    mockApi({ ...GUEST, ...archive(false) });
    await renderApp('/calls/recordings');
    const list = await screen.findByRole('list', { name: 'Recordings' });
    expect(within(list).getByRole('link', { name: 'AMA with the team' })).toHaveAttribute(
      'href',
      '/calls/12'
    );
    expect(within(list).getByRole('link', { name: 'Town hall' })).toHaveAttribute(
      'href',
      '/calls/9'
    );
    expect(list).toHaveTextContent('30:00');

    fireEvent.change(screen.getByLabelText('Search by call title'), { target: { value: 'town' } });
    expect(within(list).queryByRole('link', { name: 'AMA with the team' })).toBeNull();
    expect(within(list).getByRole('link', { name: 'Town hall' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search by call title'), { target: { value: 'xyz' } });
    expect(screen.getByText('No recording matches.')).toBeInTheDocument();
  });
});

describe('chapters', () => {
  it('a click on a chapter seeks the player; guests cannot edit them', async () => {
    mockApi({ ...GUEST, ...archive(false) });
    await renderApp('/calls/recordings');
    const chapters = await screen.findByRole('list', { name: 'Chapters' });
    // The player of the same recording as these chapters.
    const player = chapters.closest('.recording').querySelector('video');
    fireEvent.click(within(chapters).getByRole('button', { name: '12:30 Questions' }));
    expect(player.currentTime).toBe(750);
    expect(screen.queryByRole('button', { name: 'Add chapter' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Change chapter/ })).toBeNull();
  });

  it('organisers add (checked first), change and delete them', async () => {
    const calls = mockApi({
      ...signedIn({ username: 'olga', role: 'organiser' }),
      ...archive(true),
      'POST /calls/9/recordings/3/chapters': {
        status: 201,
        body: { ok: true, chapter: { id: 7, at: 90, title: 'Intro' } },
      },
      'PUT /calls/12/recordings/5/chapters/1': { body: { ok: true } },
      'DELETE /calls/12/recordings/5/chapters/2': { body: { ok: true } },
    });
    await renderApp('/calls/recordings');
    const [ama, townHall] = within(await screen.findByRole('list', { name: 'Recordings' }))
      .getAllByRole('listitem')
      .filter((item) => item.classList.contains('recording'));

    fireEvent.click(within(townHall).getByRole('button', { name: 'Add chapter' }));
    const form = within(townHall).getByRole('form', { name: 'New chapter' });
    // After the end of a 10-minute recording: refused here, nothing sent.
    fireEvent.change(within(form).getByLabelText('Time'), { target: { value: '12:00' } });
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Intro' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save chapter' }));
    expect(await within(townHall).findByRole('alert')).toHaveTextContent(/after the end/);
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false);
    fireEvent.change(within(form).getByLabelText('Time'), { target: { value: '1:30' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save chapter' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /calls/9/recordings/3/chapters')?.body).toEqual({
        at: '1:30',
        title: 'Intro',
      })
    );

    fireEvent.click(within(ama).getByRole('button', { name: 'Change chapter Welcome' }));
    const change = within(ama).getByRole('form', { name: 'Change chapter' });
    fireEvent.change(within(change).getByLabelText('Title'), { target: { value: 'Hello' } });
    fireEvent.click(within(change).getByRole('button', { name: 'Save chapter' }));
    fireEvent.click(within(ama).getByRole('button', { name: 'Delete chapter Questions' }));
    await vi.waitFor(() => {
      expect(calls.find((c) => c.key === 'PUT /calls/12/recordings/5/chapters/1')?.body).toEqual({
        at: '0:00',
        title: 'Hello',
      });
      expect(calls.some((c) => c.key === 'DELETE /calls/12/recordings/5/chapters/2')).toBe(true);
    });
  });
});
