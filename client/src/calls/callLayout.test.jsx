// ============================================================
// File:        callLayout.test.jsx
// Path:        client/src/calls/callLayout.test.jsx
// Project:     Seasonal Entertainment
// Description: The call page's room around the stage: the sidebar becomes an icon rail there
//              (expanded by its menu button or keyboard focus; the normal sidebar again on
//              other pages); the call chat collapses to a slim tab that counts new messages,
//              and this browser remembers the choice.
// ============================================================

import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';
import { COLLAPSED_KEY } from './CallChat.jsx';

const CALL = {
  id: 7,
  title: 'Town hall',
  status: 'live',
  description: '',
  createdBy: 'olga',
  chatRoom: 'call-7',
  scheduledFor: null,
  startedAt: '2026-10-19T18:00:00Z',
  endedAt: null,
};
const answers = {
  ...signedIn({ username: 'mia', role: 'member' }),
  'GET /calls/7': { body: { ok: true, call: CALL, canManage: false } },
  'GET /calls': {
    body: {
      ok: true,
      configured: true,
      canManage: false,
      calls: { live: [], upcoming: [], recent: [] },
    },
  },
  'GET /chat/rooms?include=call-7': {
    body: {
      ok: true,
      rooms: [{ slug: 'call-7', name: 'Call: Town hall', canWrite: true }],
      me: {},
    },
  },
  'GET /chat/rooms/call-7/messages': { body: { ok: true, messages: [] } },
};
// The site's navigation (the call page has a header of its own).
const sidebar = () => document.querySelector('header.sidebar');

beforeEach(() => {
  localStorage.clear();
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

it('the sidebar is a rail on a call page: the button or focus expands it', async () => {
  mockApi(answers);
  await renderApp('/calls/7');
  await screen.findByRole('heading', { name: /Town hall/ });
  expect(sidebar()).toHaveAttribute('data-rail', 'true');
  expect(sidebar()).not.toHaveAttribute('data-expanded');
  // Every item keeps its name and gets its tooltip.
  expect(screen.getByRole('link', { name: 'Games' })).toHaveAttribute('title', 'Games');

  const toggle = screen.getByRole('button', { name: 'Expand menu' });
  fireEvent.click(toggle);
  expect(sidebar()).toHaveAttribute('data-expanded', 'true');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse menu' }));
  expect(sidebar()).not.toHaveAttribute('data-expanded');

  // Keyboard focus inside opens it as well, leaving closes it.
  fireEvent.focus(screen.getByRole('link', { name: 'Games' }));
  expect(sidebar()).toHaveAttribute('data-expanded', 'true');
  fireEvent.blur(screen.getByRole('link', { name: 'Games' }), { relatedTarget: document.body });
  expect(sidebar()).not.toHaveAttribute('data-expanded');
});

it('other pages keep the normal sidebar', async () => {
  mockApi(answers);
  await renderApp('/calls');
  await screen.findByRole('heading', { name: 'Calls' });
  expect(sidebar()).not.toHaveAttribute('data-rail');
  expect(screen.queryByRole('button', { name: 'Expand menu' })).toBeNull();
});

it('the call chat collapses to a tab that counts new messages, remembered', async () => {
  mockApi(answers);
  const page = await renderApp('/calls/7');
  fireEvent.click(await screen.findByRole('button', { name: 'Collapse the call chat' }));
  expect(localStorage.getItem(COLLAPSED_KEY)).toBe('1');
  const tab = screen.getByRole('button', { name: 'Show the call chat' });
  await vi.waitFor(() =>
    expect(FakeSocket.all.at(-1)?.sent).toContainEqual({ type: 'subscribe', room: 'call-7' })
  );
  FakeSocket.all
    .at(-1)
    .push({ type: 'message', room: 'call-7', message: { id: 9, room: 'call-7' } });
  expect(await screen.findByRole('button', { name: 'Show the call chat, 1 new' })).toBe(tab);
  page.unmount();

  // A new visit: still collapsed; opening it brings the chat back and forgets the choice.
  await renderApp('/calls/7');
  fireEvent.click(await screen.findByRole('button', { name: 'Show the call chat' }));
  expect(await screen.findByRole('button', { name: 'Collapse the call chat' })).toBeInTheDocument();
  expect(localStorage.getItem(COLLAPSED_KEY)).toBeNull();
});
