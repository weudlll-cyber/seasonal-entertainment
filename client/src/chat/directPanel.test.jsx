// ============================================================
// File:        directPanel.test.jsx
// Path:        client/src/chat/directPanel.test.jsx
// Project:     Seasonal Entertainment
// Description: The chat module's direct-message view with real cryptography: the list puts
//              favourite members first, then the most recent, with unread dots; a conversation
//              is decrypted in the browser (with a notice where the partner's key changed, and
//              messages for an earlier own key marked unreadable) and marked read; sending puts
//              only ciphertext on the wire, and a changed partner key is encrypted for again.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptDirect, encryptDirect, newKeyPair } from '@seasonal-entertainment/shared/crypto.js';
import { SessionProvider } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { DirectPanel } from './index.js';
import { showDirect } from './directView.js';

const MIA = { id: 1, username: 'mia', role: 'member' };
const ZOE = { id: 8, username: 'zoe' };
let mia;
let zoe;

beforeEach(async () => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  act(() => showDirect(null));
  [mia, zoe] = [await newKeyPair(), await newKeyPair()];
});

const conversation = (partner, extra) => ({
  partner: { ...partner, online: false },
  favourite: false,
  lastMessageAt: null,
  unread: false,
  ...extra,
});

// A message as the server holds it: made by `from` (keys { publicKey, privateKey }) for `to`.
async function stored(id, fromId, toId, payload, fromPair, toPublicKey, keyIds) {
  const box = await encryptDirect(payload, toPublicKey, fromPair.privateKey);
  return {
    id,
    senderId: fromId,
    recipientId: toId,
    ...keyIds,
    ...box,
    createdAt: '2026-10-18T09:00:00.000Z',
  };
}

const show = () =>
  render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={mia.privateKey} />
    </SessionProvider>
  );

describe('the conversation list', () => {
  it('favourites first, then the most recent; unread dots', async () => {
    mockApi({
      ...signedIn(MIA),
      'GET /chat/direct': {
        body: {
          ok: true,
          conversations: [
            conversation({ id: 2, username: 'ann' }, { lastMessageAt: '2026-10-18T08:00:00Z' }),
            conversation(
              { id: 3, username: 'bob' },
              { lastMessageAt: '2026-10-18T09:00:00Z', unread: true }
            ),
            conversation({ id: 4, username: 'cy' }, { favourite: true }),
          ],
        },
      },
    });
    show();
    const list = await screen.findByRole('list', { name: 'Private conversations' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((r) => r.textContent.replace('★', '').trim())).toEqual(['cy', 'bob', 'ann']);
    expect(within(rows[1]).getByRole('img', { name: 'unread messages' })).toBeInTheDocument();
    expect(within(rows[2]).queryByRole('img', { name: 'unread messages' })).toBeNull();
  });
});

describe('a conversation', () => {
  async function open(extraAnswers = {}) {
    const zoeOld = await newKeyPair();
    const messages = [
      await stored(10, 8, 1, { text: 'hello from zoe' }, zoeOld, mia.publicKey, {
        senderKeyId: 7,
        recipientKeyId: 1,
      }),
      await stored(11, 8, 1, { text: 'new key here https://x.example' }, zoe, mia.publicKey, {
        senderKeyId: 9,
        recipientKeyId: 1,
      }),
      await stored(12, 1, 8, { text: 'for my old key' }, mia, zoe.publicKey, {
        senderKeyId: 5,
        recipientKeyId: 9,
      }),
    ];
    const calls = mockApi({
      ...signedIn(MIA),
      'GET /chat/direct/8': {
        body: {
          ok: true,
          partner: { ...ZOE, online: true },
          partnerKey: { keyId: 9, publicKey: zoe.publicKey },
          keys: { 7: zoeOld.publicKey, 9: zoe.publicKey, 5: mia.publicKey },
          messages,
        },
      },
      'POST /chat/direct/8/read': { body: { ok: true } },
      ...extraAnswers,
    });
    act(() => showDirect(ZOE));
    show();
    const list = await screen.findByRole('list', { name: 'Private messages with zoe' });
    await within(list).findByText('hello from zoe');
    return { calls, list };
  }

  it('decrypts in the browser, notes the key change and an earlier own key, marks read', async () => {
    const { calls, list } = await open();
    expect(within(list).getByRole('link', { name: 'https://x.example' })).toBeInTheDocument();
    expect(within(list).getByText("zoe's security key changed")).toBeInTheDocument();
    expect(within(list).getByText(/made for an earlier key/)).toBeInTheDocument();
    expect(within(list).queryByText('for my old key')).toBeNull();
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /chat/direct/8/read')?.body).toEqual({ lastId: 11 })
    );
  });

  it('sends only ciphertext, made for the partner', async () => {
    const { calls } = await open({ 'POST /chat/direct/8': { status: 201, body: { ok: true } } });
    const secret = 'secret-canary-client';
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: secret } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => expect(calls.some((c) => c.key === 'POST /chat/direct/8')).toBe(true));
    const { body } = calls.find((c) => c.key === 'POST /chat/direct/8');
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain(secret);
    expect(body).toMatchObject({ senderKeyId: 1, recipientKeyId: 9 });
    expect(await decryptDirect(body, mia.publicKey, zoe.privateKey)).toEqual({ text: secret });
    // No file uploads in direct messages.
    expect(screen.queryByLabelText('File to attach')).toBeNull();
  });

  it('a partner key that changed meanwhile: encrypted once more for the new key', async () => {
    const newest = await newKeyPair();
    let tries = 0;
    const { calls } = await open({
      'POST /chat/direct/8': () => {
        tries += 1;
        return tries === 1
          ? {
              status: 409,
              body: {
                ok: false,
                error: 'key_changed',
                message: 'changed',
                partnerKey: { keyId: 10, publicKey: newest.publicKey },
              },
            }
          : { status: 201, body: { ok: true } };
      },
    });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => expect(tries).toBe(2));
    const second = calls.filter((c) => c.key === 'POST /chat/direct/8')[1].body;
    expect(second.recipientKeyId).toBe(10);
    expect(await decryptDirect(second, mia.publicKey, newest.privateKey)).toEqual({
      text: 'again',
    });
  });
});
