// ============================================================
// File:        directLinkPreview.test.jsx
// Path:        client/src/chat/directLinkPreview.test.jsx
// Project:     Seasonal Entertainment
// Description: Link previews in direct messages with real cryptography (useDirectLinkPreview,
//              DirectConversation, DirectMessage): the card asked for while writing travels
//              encrypted inside the message (the server sees only ciphertext); the writer can
//              remove it and then none is sent; with the setting off no preview is asked for;
//              the recipient shows a received card with no network request (its image is inline
//              data), and a card whose image is anything else shows no image.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptDirect, newKeyPair } from '@seasonal-entertainment/shared/crypto.js';
import { SessionProvider } from '../session/SessionContext.jsx';
import { storedDirect } from '../test/directFixtures.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { DirectPanel } from './index.js';
import { showDirect } from './directView.js';

const ZOE = { id: 8, username: 'zoe' };
const LINK = 'https://site.example/page';
// A 1 x 1 WebP, as the server would send it.
const IMAGE = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
const CARD = {
  url: LINK,
  title: 'A page',
  description: 'About the page.',
  siteName: 'site.example',
  image: IMAGE,
};
let mia;
let zoe;

beforeEach(async () => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  act(() => showDirect(null));
  [mia, zoe] = [await newKeyPair(), await newKeyPair()];
});

// messages: as stored; me: the signed-in member's extra fields (the setting).
async function open({ messages = [], me = {} } = {}) {
  const calls = mockApi({
    ...signedIn({ id: 1, username: 'mia', role: 'member', ...me }),
    'GET /chat/direct/8': {
      body: {
        ok: true,
        partner: { ...ZOE, online: false },
        partnerKey: { keyId: 9, publicKey: zoe.publicKey },
        keys: { 9: zoe.publicKey },
        messages,
      },
    },
    'POST /chat/direct/8/read': { body: { ok: true } },
    'POST /chat/direct/preview': { body: { ok: true, preview: CARD } },
    'POST /chat/direct/8': { status: 201, body: { ok: true } },
  });
  act(() => showDirect(ZOE));
  render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={mia.privateKey} />
    </SessionProvider>
  );
  await screen.findByRole('list', { name: 'Private messages with zoe' });
  return calls;
}

// The composer comes once the conversation (and the partner's key) has loaded.
const write = async (text) =>
  fireEvent.change(await screen.findByLabelText('Message'), { target: { value: text } });
const sent = async (calls) => {
  await vi.waitFor(() => expect(calls.some((c) => c.key === 'POST /chat/direct/8')).toBe(true));
  return calls.find((c) => c.key === 'POST /chat/direct/8').body;
};

describe('writing', () => {
  it('the card travels encrypted inside the message; the server sees only ciphertext', async () => {
    const calls = await open();
    await write(`look ${LINK}`);
    const card = await screen.findByRole('group', { name: 'Link preview' });
    expect(within(card).getByRole('link', { name: 'A page' })).toHaveAttribute('href', LINK);
    expect(calls.find((c) => c.key === 'POST /chat/direct/preview').body).toEqual({ url: LINK });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const body = await sent(calls);
    expect(JSON.stringify(body)).not.toContain('A page');
    expect(JSON.stringify(body)).not.toContain('site.example');
    expect(await decryptDirect(body, mia.publicKey, zoe.privateKey)).toEqual({
      text: `look ${LINK}`,
      preview: CARD,
    });
  });

  it('a removed card is not sent', async () => {
    const calls = await open();
    await write(`look ${LINK}`);
    await screen.findByRole('group', { name: 'Link preview' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove link preview' }));
    expect(screen.queryByRole('group', { name: 'Link preview' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await decryptDirect(await sent(calls), mia.publicKey, zoe.privateKey)).toEqual({
      text: `look ${LINK}`,
    });
  });

  it('with the setting off, no preview is asked for at all', async () => {
    const calls = await open({ me: { dmLinkPreviews: false } });
    await write(`look ${LINK}`);
    await act(() => new Promise((resolve) => setTimeout(resolve, 1000)));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await sent(calls);
    expect(calls.some((c) => c.key === 'POST /chat/direct/preview')).toBe(false);
  });
});

describe('receiving', () => {
  const from = (payload) =>
    storedDirect(
      20,
      { id: 8, pair: zoe, keyId: 9 },
      { id: 1, publicKey: mia.publicKey, keyId: 1 },
      payload
    );

  it('shows the card with no network request to the link: the image is inline data', async () => {
    const calls = await open({ messages: [await from({ text: LINK, preview: CARD })] });
    const card = await screen.findByRole('complementary', { name: 'Link preview: A page' });
    expect(within(card).getByRole('img')).toHaveAttribute('src', IMAGE);
    expect(
      calls
        .map((c) => c.key)
        .filter((key) => !key.startsWith('GET /') && key !== 'POST /chat/direct/8/read')
    ).toEqual([]);
    expect(JSON.stringify(calls.map((c) => c.key))).not.toContain('site.example');
  });

  it('a card whose image is not inline data shows no image', async () => {
    await open({
      messages: [
        await from({ text: LINK, preview: { ...CARD, image: 'https://evil.example/x.png' } }),
      ],
    });
    const card = await screen.findByRole('complementary', { name: 'Link preview: A page' });
    expect(within(card).queryByRole('img')).toBeNull();
  });
});
