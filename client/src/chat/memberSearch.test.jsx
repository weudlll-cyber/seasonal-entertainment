// ============================================================
// File:        memberSearch.test.jsx
// Path:        client/src/chat/memberSearch.test.jsx
// Project:     Seasonal Entertainment
// Description: "Find a member" in the Direct tab: nothing is asked for under 2 characters; the
//              results come as a listbox of a combobox; arrow keys and Enter open a member's
//              conversation; a member without a key is greyed, says so, and cannot be chosen;
//              Escape closes the list.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { newKeyPair } from '@seasonal-entertainment/shared/crypto.js';
import { SessionProvider } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { showDirect } from './directView.js';
import { DirectPanel } from './index.js';

let calls;
beforeEach(async () => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  act(() => showDirect(null));
  const { privateKey } = await newKeyPair();
  calls = mockApi({
    ...signedIn({ id: 1, username: 'mia', role: 'member' }),
    'GET /chat/direct': { body: { ok: true, conversations: [] } },
    'GET /chat/members?q=ki': {
      body: {
        ok: true,
        members: [
          { id: 8, username: 'kim', canReceive: false, online: false },
          { id: 9, username: 'kira', canReceive: true, online: true },
        ],
      },
    },
    'GET /chat/direct/9': {
      body: {
        ok: true,
        partner: { id: 9, username: 'kira', online: true },
        partnerKey: null,
        keys: {},
        messages: [],
      },
    },
  });
  render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={privateKey} />
    </SessionProvider>
  );
});

const field = () => screen.getByRole('combobox', { name: 'Find a member' });

it('asks nothing under 2 characters', async () => {
  fireEvent.change(await screen.findByRole('combobox', { name: 'Find a member' }), {
    target: { value: 'k' },
  });
  expect(screen.getByText('Type at least 2 characters.')).toBeInTheDocument();
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(calls.some((c) => c.key.startsWith('GET /chat/members'))).toBe(false);
});

it('lists members; keyless ones cannot be chosen; Enter opens a conversation', async () => {
  fireEvent.change(await screen.findByRole('combobox', { name: 'Find a member' }), {
    target: { value: 'ki' },
  });
  const list = await screen.findByRole('listbox', { name: 'Members' });
  const [kim, kira] = within(list).getAllByRole('option');
  expect(field()).toHaveAttribute('aria-expanded', 'true');
  expect(kim).toHaveAttribute('aria-disabled', 'true');
  expect(kim).toHaveTextContent('Has not set up private messages yet');
  expect(kira).toHaveAttribute('aria-disabled', 'false');
  expect(field()).toHaveAttribute('aria-activedescendant', kim.id);

  // The keyless member: neither Enter nor a click opens anything.
  fireEvent.keyDown(field(), { key: 'Enter' });
  fireEvent.click(kim);
  expect(screen.queryByRole('list', { name: /Private messages with/ })).toBeNull();

  fireEvent.keyDown(field(), { key: 'ArrowDown' });
  expect(field()).toHaveAttribute('aria-activedescendant', kira.id);
  fireEvent.keyDown(field(), { key: 'Enter' });
  expect(
    await screen.findByRole('list', { name: 'Private messages with kira' })
  ).toBeInTheDocument();
});

it('Escape closes the list', async () => {
  fireEvent.change(await screen.findByRole('combobox', { name: 'Find a member' }), {
    target: { value: 'ki' },
  });
  await screen.findByRole('listbox', { name: 'Members' });
  fireEvent.keyDown(field(), { key: 'Escape' });
  expect(field()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('option')).toBeNull();
  expect(field()).toHaveValue('ki');
});
