// ============================================================
// File:        safetyNumber.test.jsx
// Path:        client/src/chat/safetyNumber.test.jsx
// Project:     Seasonal Entertainment
// Description: Safety numbers of direct conversations (docs/CHAT.md, "Safety numbers"), with
//              real cryptography: both members see the same 12 groups of 5 digits under the
//              conversation's "…" → "Verify safety number"; a new key gives another number;
//              a partner key that changed since this device last saw it shows the notice and
//              removes the verified mark, and sending stays possible; the mark is kept per
//              device (another browser's storage knows nothing of it).
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newKeyPair, safetyNumber } from '@seasonal-entertainment/shared/crypto.js';
import { SessionProvider } from '../session/SessionContext.jsx';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { DirectPanel } from './index.js';
import { showDirect } from './directView.js';

const MIA = { id: 1, username: 'mia', role: 'member' };
const ZOE = { id: 8, username: 'zoe', role: 'member' };
const NOTICE = "zoe's security key changed — verify the safety number again";
let mia;
let zoe;

beforeEach(async () => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  localStorage.clear();
  act(() => showDirect(null));
  [mia, zoe] = [await newKeyPair(), await newKeyPair()];
});

// me (with my key pair) opens the conversation with partner, whose current key is given.
async function openAs(me, myPair, partner, partnerKey) {
  mockApi({
    ...signedIn(me),
    [`GET /chat/direct/${partner.id}`]: {
      body: {
        ok: true,
        partner: { ...partner, online: false },
        partnerKey,
        keys: { [partnerKey.keyId]: partnerKey.publicKey },
        messages: [],
      },
    },
    [`POST /chat/direct/${partner.id}/read`]: { body: { ok: true } },
  });
  act(() => showDirect(partner));
  const view = render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={myPair.privateKey} />
    </SessionProvider>
  );
  await screen.findByRole('list', { name: `Private messages with ${partner.username}` });
  return view;
}

// Opens "…" → "Verify safety number" and reads the groups shown.
async function readNumber(partnerName) {
  fireEvent.click(
    await screen.findByRole('button', { name: `Actions for the conversation with ${partnerName}` })
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Verify safety number' }));
  const dialog = screen.getByRole('dialog', { name: `Safety number with ${partnerName}` });
  const list = await within(dialog).findByRole('list', { name: 'Safety number' });
  return {
    dialog,
    groups: within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  };
}

describe('safety numbers', () => {
  it('both members see the same 12 groups of 5 digits', async () => {
    const miaView = await openAs(MIA, mia, ZOE, { keyId: 9, publicKey: zoe.publicKey });
    const miaSees = (await readNumber('zoe')).groups;
    miaView.unmount();
    await openAs(ZOE, zoe, MIA, { keyId: 1, publicKey: mia.publicKey });
    const zoeSees = (await readNumber('mia')).groups;
    expect(miaSees).toEqual(zoeSees);
    expect(miaSees).toHaveLength(12);
    expect(miaSees.every((g) => /^\d{5}$/.test(g))).toBe(true);
    expect(miaSees).toEqual(await safetyNumber(mia.publicKey, zoe.publicKey));
  });

  it("a new key of the partner's gives another number", async () => {
    const first = await openAs(MIA, mia, ZOE, { keyId: 9, publicKey: zoe.publicKey });
    const before = (await readNumber('zoe')).groups;
    first.unmount();
    const zoeNew = await newKeyPair();
    await openAs(MIA, mia, ZOE, { keyId: 10, publicKey: zoeNew.publicKey });
    expect((await readNumber('zoe')).groups).not.toEqual(before);
  });

  it('marking it verified shows the badge, on this device only', async () => {
    const view = await openAs(MIA, mia, ZOE, { keyId: 9, publicKey: zoe.publicKey });
    const { dialog } = await readNumber('zoe');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as verified' }));
    expect(within(dialog).getByText('Verified on this device.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.getByText('Verified')).toBeInTheDocument();
    view.unmount();
    // The same member on another device: that browser's storage has no mark.
    localStorage.clear();
    await openAs(MIA, mia, ZOE, { keyId: 9, publicKey: zoe.publicKey });
    await readNumber('zoe');
    expect(screen.queryByText('Verified')).toBeNull();
  });

  it('a changed partner key: the notice, the mark removed, sending still possible', async () => {
    const first = await openAs(MIA, mia, ZOE, { keyId: 9, publicKey: zoe.publicKey });
    const { dialog } = await readNumber('zoe');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as verified' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(NOTICE)).toBeNull();
    first.unmount();

    const zoeNew = await newKeyPair();
    await openAs(MIA, mia, ZOE, { keyId: 10, publicKey: zoeNew.publicKey });
    expect(await screen.findByRole('status')).toHaveTextContent(NOTICE);
    expect(screen.queryByText('Verified')).toBeNull();
    expect(Object.keys(localStorage).some((k) => k.startsWith('se.dm.verified.'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});
