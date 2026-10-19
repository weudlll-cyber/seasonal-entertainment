// ============================================================
// File:        embedLoginPopup.test.jsx
// Path:        client/src/embed/embedLoginPopup.test.jsx
// Project:     Seasonal Entertainment
// Description: The login popup of the chat embedded on another site (/embed-login,
//              EmbedLoginPage.jsx): it names the site and refuses one that is not approved;
//              signed out, it sends the visitor to the normal login and back; signed in, the
//              password opens the private key here, a token is asked for, and token, account
//              and key go to the opener only if that is this site's own window, addressed to
//              this origin; a wrong password or a foreign opener gets no token at all.
// ============================================================

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deriveAccountKeys, newKeyPair, sealBytes } from '@seasonal-entertainment/shared/crypto.js';
import App from '../app/App.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, PRELOGIN, PRELOGIN_SALT, mockApi, signedIn } from '../test/mockApi.js';

const SITE = 'https://game.example';
const PASSWORD = 'correct-horse-1';
const MIA = { id: 1, username: 'mia', role: 'member' };
const CHECK = `GET /embed/check?origin=${encodeURIComponent(SITE)}`;
let opener;

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  opener = { location: { origin: window.location.origin }, postMessage: vi.fn() };
  Object.defineProperty(window, 'opener', { value: opener, configurable: true });
  vi.spyOn(window, 'close').mockImplementation(() => {});
});
afterEach(() => {
  Object.defineProperty(window, 'opener', { value: null, configurable: true });
  vi.restoreAllMocks();
});

// Mia's sealed key as the server keeps it, and the answers of a signed-in popup.
async function signedInPopup(extra = {}) {
  const pair = await newKeyPair();
  const { wrapKey } = await deriveAccountKeys(PASSWORD, PRELOGIN_SALT);
  const key = {
    keyId: 4,
    sealedPrivateKey: await sealBytes(pair.privateKey, wrapKey),
    recovery: null,
  };
  const calls = mockApi({
    ...signedIn(MIA),
    ...PRELOGIN,
    [CHECK]: { body: { ok: true, allowed: true } },
    'GET /keys/me': { body: { ok: true, key } },
    'POST /keys/check': {
      status: 401,
      body: { ok: false, error: 'invalid_credentials', message: 'Wrong.' },
    },
    'POST /embed/token': {
      body: { ok: true, token: 'tok', expiresAt: '2026-10-20T00:00:00.000Z' },
    },
    ...extra,
  });
  return { calls, pair };
}

function showPopup(origin = SITE) {
  render(
    <MemoryRouter initialEntries={[`/embed-login?origin=${encodeURIComponent(origin)}`]}>
      <App />
    </MemoryRouter>
  );
}

const typePassword = (value) =>
  fireEvent.change(screen.getByLabelText('Password'), { target: { value } });

it('names the site, opens the key with the password and hands over to its own opener only', async () => {
  const { calls, pair } = await signedInPopup();
  showPopup();
  await screen.findByRole('button', { name: 'Allow' });
  const question = screen.getByText(
    (_, el) => el?.tagName === 'P' && /^Chat on/.test(el.textContent)
  );
  expect(question).toHaveTextContent(`Chat on ${SITE} as mia?`);
  typePassword(PASSWORD);
  fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
  await waitFor(() => expect(opener.postMessage).toHaveBeenCalledTimes(1));
  const [message, target] = opener.postMessage.mock.calls[0];
  expect(target).toBe(window.location.origin);
  expect(message).toMatchObject({
    source: 'seasonal-chat-login',
    type: 'login',
    origin: SITE,
    token: 'tok',
    user: { username: 'mia' },
    key: { keyId: 4 },
  });
  expect([...message.key.privateKey]).toEqual([...pair.privateKey]);
  expect(calls.find((c) => c.key === 'POST /embed/token').body).toEqual({ origin: SITE });
  expect(window.close).toHaveBeenCalled();
});

it('without private messages: no key is opened or handed over', async () => {
  const { calls } = await signedInPopup();
  // (The site's own key state loads GET /keys/me on its own; the popup asks nothing more.)
  showPopup();
  fireEvent.click(await screen.findByRole('button', { name: 'Allow without private messages' }));
  await waitFor(() => expect(opener.postMessage).toHaveBeenCalledTimes(1));
  expect(opener.postMessage.mock.calls[0][0].key).toBe(null);
  expect(calls.some((c) => c.key === 'POST /auth/prelogin')).toBe(false);
});

it('a wrong password gets no token', async () => {
  const { calls } = await signedInPopup();
  showPopup();
  const allow = await screen.findByRole('button', { name: 'Allow' });
  typePassword('wrong-horse-1');
  fireEvent.click(allow);
  expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
  expect(calls.some((c) => c.key === 'POST /embed/token')).toBe(false);
  expect(opener.postMessage).not.toHaveBeenCalled();
});

it('an opener on another site gets nothing, and no token is asked for', async () => {
  const { calls } = await signedInPopup();
  const foreign = {
    get location() {
      throw new DOMException('Blocked a frame with origin', 'SecurityError');
    },
    postMessage: vi.fn(),
  };
  Object.defineProperty(window, 'opener', { value: foreign, configurable: true });
  showPopup();
  fireEvent.click(await screen.findByRole('button', { name: 'Allow without private messages' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/from the chat on the page/);
  expect(foreign.postMessage).not.toHaveBeenCalled();
  expect(calls.some((c) => c.key === 'POST /embed/token')).toBe(false);
});

it('refuses a site that is not approved', async () => {
  mockApi({
    ...signedIn(MIA),
    [`GET /embed/check?origin=${encodeURIComponent('https://evil.example')}`]: {
      body: { ok: true, allowed: false },
    },
  });
  showPopup('https://evil.example');
  expect(await screen.findByRole('alert')).toHaveTextContent('not approved');
  expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
});

it('signed out: the normal login, and back here afterwards', async () => {
  mockApi({ ...GUEST, [CHECK]: { body: { ok: true, allowed: true } } });
  showPopup();
  const link = await screen.findByRole('link', { name: 'Log in' });
  expect(link).toHaveAttribute(
    'href',
    `/login?next=${encodeURIComponent(`/embed-login?origin=${encodeURIComponent(SITE)}`)}`
  );
});
