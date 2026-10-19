// ============================================================
// File:        embedForeignDirect.test.jsx
// Path:        client/src/embed/embedForeignDirect.test.jsx
// Project:     Seasonal Entertainment
// Description: Direct messages in the chat embedded on another site's page (docs/EMBED.md):
//              read and sent with the key the popup handed over, the host never receiving a
//              token, a key or message text; a refused token takes account and key at once, and
//              the key is gone from memory (the same account coming back finds it locked).
// ============================================================

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { decryptDirect, newKeyPair } from '@seasonal-entertainment/shared/crypto.js';
import { storedDirect } from '../test/directFixtures.js';
import {
  MIA,
  SITE,
  TOKEN,
  ZOE,
  answers,
  logIn,
  sentToHost,
  setUpForeignHost,
  showEmbed,
  tearDownForeignHost,
} from '../test/foreignEmbed.jsx';
import { GUEST, mockApi } from '../test/mockApi.js';

beforeEach(setUpForeignHost);
afterEach(tearDownForeignHost);

it('reads and sends direct messages with the handed-over key; the host learns none of it', async () => {
  const [mia, zoe] = [await newKeyPair(), await newKeyPair()];
  const incoming = await storedDirect(
    10,
    { id: 8, pair: zoe, keyId: 9 },
    { id: 1, publicKey: mia.publicKey, keyId: 1 },
    { text: 'hello from zoe' }
  );
  const calls = mockApi(
    answers(true, {
      'GET /chat/direct': { body: { ok: true, conversations: [] } },
      'GET /chat/direct/8': {
        body: {
          ok: true,
          partner: { ...ZOE, online: false },
          partnerKey: { keyId: 9, publicKey: zoe.publicKey },
          keys: { 9: zoe.publicKey },
          messages: [incoming],
          more: false,
        },
      },
      'POST /chat/direct/8/read': { body: { ok: true } },
      'POST /chat/direct/8': { status: 201, body: { ok: true } },
    })
  );
  await showEmbed();
  await logIn({ keyId: 1, privateKey: mia.privateKey });
  fireEvent.click(screen.getByRole('tab', { name: /Direct/ }));
  const { showDirect } = await import('../chat/directView.js');
  act(() => showDirect(ZOE));
  const list = await screen.findByRole('list', { name: 'Private messages with zoe' });
  expect(await within(list).findByText('hello from zoe')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'sent from the game' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(calls.some((c) => c.key === 'POST /chat/direct/8')).toBe(true));
  const sent = calls.find((c) => c.key === 'POST /chat/direct/8');
  expect(sent.headers['X-Embed-Token']).toBe(TOKEN);
  expect(await decryptDirect(sent.body, mia.publicKey, zoe.privateKey)).toEqual({
    text: 'sent from the game',
  });

  // Everything the game page ever received.
  const toHost = JSON.stringify(sentToHost());
  for (const secret of [TOKEN, 'hello from zoe', 'sent from the game', String(mia.privateKey)]) {
    expect(toHost).not.toContain(secret);
  }
});

it('a refused token takes the account and the key at once', async () => {
  const pair = await newKeyPair();
  let refuse = false;
  const calls = mockApi(
    answers(true, {
      'GET /chat/direct': () =>
        refuse
          ? {
              status: 401,
              body: { ok: false, error: 'embed_token_invalid', message: 'Please log in again.' },
            }
          : { body: { ok: true, conversations: [] } },
    })
  );
  await showEmbed();
  await logIn({ keyId: 1, privateKey: pair.privateKey });
  refuse = true;
  fireEvent.click(screen.getByRole('tab', { name: /Direct/ }));
  expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: /Direct/ })).toBeNull();
  // From the refusal on, nothing goes out with the dropped token (the panel reloads as a guest).
  await waitFor(() => expect(calls.at(-1).key).toBe('GET /chat/rooms/general/messages'));
  const sinceRefusal = calls.slice(calls.findIndex((c) => c.key === 'GET /chat/direct') + 1);
  expect(sinceRefusal.length).toBeGreaterThan(0);
  expect(sinceRefusal.filter((c) => c.headers['X-Embed-Token'])).toEqual([]);

  // Logged in again without unlocking: the earlier key is not there any more.
  refuse = false;
  await logIn(null);
  fireEvent.click(screen.getByRole('tab', { name: /Direct/ }));
  expect(
    await screen.findByText('Your private messages are locked on this page.')
  ).toBeInTheDocument();
});

it('the dropped key is gone from memory: the same account coming back finds it locked', async () => {
  mockApi(GUEST);
  const { markForeignEmbed, setEmbedToken, dropEmbedToken } = await import('./embedAuth.js');
  const { SessionProvider, useSession } = await import('../session/SessionContext.jsx');
  const { KeyProvider, useKeys } = await import('../keys/KeyContext.jsx');
  const { useEmbedLogin } = await import('./useEmbedLogin.js');
  markForeignEmbed();
  // The embed's own hook, and buttons standing in for the hand-over and a returning session.
  function Probe() {
    useEmbedLogin(SITE);
    const keys = useKeys();
    const { setUser } = useSession();
    const adopt = () => {
      setEmbedToken(TOKEN);
      keys.adopt(MIA.id, { keyId: 1, privateKey: new Uint8Array([1, 2, 3]) });
      setUser(MIA);
    };
    return (
      <>
        <p>key: {keys.status}</p>
        <button onClick={adopt}>hand over</button>
        <button onClick={dropEmbedToken}>drop</button>
        <button onClick={() => setUser(MIA)}>same account again</button>
      </>
    );
  }
  render(
    <SessionProvider>
      <KeyProvider>
        <Probe />
      </KeyProvider>
    </SessionProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'hand over' }));
  expect(await screen.findByText('key: unlocked')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'drop' }));
  expect(await screen.findByText('key: none')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'same account again' }));
  expect(await screen.findByText('key: locked')).toBeInTheDocument();
});
