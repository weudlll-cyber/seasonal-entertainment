// ============================================================
// File:        callChatEnded.test.jsx
// Path:        client/src/calls/callChatEnded.test.jsx
// Project:     Seasonal Entertainment
// Description: The chat column of a call that has ended (CallChat.jsx; seen 2026-11-13 as an
//              empty white box with only its title): it says the chat is closed; an empty one
//              says "No messages in this call." inside its box, one with messages shows them
//              read-only; while the messages are still on their way it says nothing yet.
// ============================================================

import { screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

vi.mock('livekit-client', () => import('../test/fakeLiveKit.js'));

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const ENDED = {
  id: 7,
  title: 'Town hall',
  status: 'ended',
  description: '',
  createdBy: 'olga',
  chatRoom: 'call-7',
  scheduledFor: null,
  startedAt: '2026-10-19T18:00:00Z',
  endedAt: '2026-10-19T19:00:00Z',
};

const message = {
  id: 1,
  room: 'call-7',
  author: 'mia',
  isGuest: false,
  kind: 'text',
  body: 'Thanks for coming',
  media: null,
  preview: null,
  createdAt: '2026-10-19T18:30:00.000Z',
  hiddenAt: null,
};

// messages: the room's answer (a promise holds it back).
const answers = (messages) => ({
  ...signedIn({ username: 'mia', role: 'member' }),
  'GET /calls/7': { body: { ok: true, call: ENDED, canManage: false } },
  'GET /calls/7/recordings': { body: { ok: true, recordings: [] } },
  'GET /polls?call=7': { body: { ok: true, polls: [] } },
  'GET /chat/rooms?include=call-7': {
    body: {
      ok: true,
      rooms: [{ slug: 'call-7', name: 'Call: Town hall', canWrite: false }],
      me: {},
    },
  },
  'GET /chat/rooms/call-7/messages': messages,
});

const column = () => screen.findByRole('complementary', { name: 'Call chat' });

it('an ended call without messages says so, and that its chat is closed', async () => {
  mockApi(answers({ body: { ok: true, messages: [] } }));
  await renderApp('/calls/7');
  const chat = await column();
  expect(await within(chat).findByText('No messages in this call.')).toBeInTheDocument();
  expect(await within(chat).findByText("This call's chat is closed.")).toBeInTheDocument();
  expect(within(chat).queryByText(/You can read this room/)).toBeNull();
});

it('an ended call with messages shows them read-only, without the empty line', async () => {
  mockApi(answers({ body: { ok: true, messages: [message] } }));
  await renderApp('/calls/7');
  const chat = await column();
  expect(await within(chat).findByText('Thanks for coming')).toBeInTheDocument();
  expect(await within(chat).findByText("This call's chat is closed.")).toBeInTheDocument();
  expect(within(chat).queryByText('No messages in this call.')).toBeNull();
  expect(within(chat).queryByRole('textbox')).toBeNull();
});

it('says nothing about messages while they are still on their way', async () => {
  mockApi(answers(() => new Promise(() => {})));
  await renderApp('/calls/7');
  const chat = await column();
  expect(await within(chat).findByText("This call's chat is closed.")).toBeInTheDocument();
  expect(within(chat).queryByText('No messages in this call.')).toBeNull();
});
