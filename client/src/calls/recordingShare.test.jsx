// ============================================================
// File:        recordingShare.test.jsx
// Path:        client/src/calls/recordingShare.test.jsx
// Project:     Seasonal Entertainment
// Description: Sharing a recording (ShareRecording, RecordingItem, pages/RecordingPage;
//              docs/CALLS.md, "Sharing a recording"): every recording in the archive has a
//              "Share" button that copies its stable link with "Link copied"; on a touch screen
//              with a share sheet the sheet gets the link instead, and closing it copies
//              nothing; without a clipboard the link is shown. /recordings/:id shows only that
//              recording with its call's title and link; a missing one is "Page not found";
//              after an organiser deletes it the page goes to the archive.
// ============================================================

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const RECORDING = {
  id: 5,
  callId: 12,
  title: 'AMA with the team',
  startedAt: '2026-10-22T18:00:00Z',
  seconds: 1800,
  chapters: [],
};
const LINK = `${window.location.origin}/recordings/5`;
const archive = {
  'GET /calls/recordings': { body: { ok: true, canManage: false, recordings: [RECORDING] } },
};
const page = (canManage) => ({
  'GET /calls/recordings/5': { body: { ok: true, canManage, recording: RECORDING } },
});

let writeText;
beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText }, share: undefined });
});
afterEach(() => vi.unstubAllGlobals());

// A touch-first screen (the share sheet's place) or not.
const touchScreen = (coarse) =>
  vi.stubGlobal('matchMedia', (query) => ({
    matches: coarse && query === '(pointer: coarse)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe('the Share button', () => {
  it('copies the stable link and says so', async () => {
    mockApi({ ...GUEST, ...archive });
    await renderApp('/calls/recordings');
    const item = (await screen.findByRole('list', { name: 'Recordings' })).querySelector('li');
    fireEvent.click(within(item).getByRole('button', { name: 'Share' }));
    expect(await within(item).findByText('Link copied')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it('opens the share sheet on a touch screen; closing it copies nothing', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('closed'), { name: 'AbortError' }));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText }, share });
    touchScreen(true);
    mockApi({ ...GUEST, ...archive });
    await renderApp('/calls/recordings');
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ title: 'AMA with the team', url: LINK })
    );
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText('Link copied')).toBeNull();
  });

  it('shows the link when the clipboard is blocked', async () => {
    writeText.mockRejectedValue(new Error('blocked'));
    touchScreen(false);
    mockApi({ ...GUEST, ...archive });
    await renderApp('/calls/recordings');
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(await screen.findByRole('link', { name: LINK })).toHaveAttribute('href', LINK);
  });
});

describe('the recording page', () => {
  it('shows only that recording, with its call', async () => {
    mockApi({ ...GUEST, ...page(false) });
    await renderApp('/recordings/5');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'AMA with the team' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'To the call' })).toHaveAttribute('href', '/calls/12');
    const list = screen.getByRole('list', { name: 'Recording' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('30:00');
    expect(within(list).getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: 'Delete recording' })).toBeNull();
  });

  it('is "Page not found" for a missing recording', async () => {
    mockApi({
      ...GUEST,
      'GET /calls/recordings/9': {
        status: 404,
        body: { ok: false, message: 'No such recording.' },
      },
    });
    await renderApp('/recordings/9');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('goes to the archive after an organiser deletes it', async () => {
    mockApi({
      ...signedIn({ username: 'olga', role: 'organiser' }),
      ...page(true),
      ...archive,
      'DELETE /calls/12/recordings/5': { body: { ok: true } },
    });
    await renderApp('/recordings/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete recording' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Recordings' })
    ).toBeInTheDocument();
  });
});
