// ============================================================
// File:        reportDirect.test.jsx
// Path:        client/src/chat/reportDirect.test.jsx
// Project:     Seasonal Entertainment
// Description: Reporting a direct message in the browser, with real cryptography: Report is
//              offered on the partner's messages; the dialog lists the conversation up to the
//              reported message with that one selected; without "Share the selected messages
//              with the moderators" no message text is sent; with it, exactly the selected
//              messages go along as copies.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { newKeyPair } from '@seasonal-entertainment/shared/crypto.js';
import { SessionProvider } from '../session/SessionContext.jsx';
import { storedDirect } from '../test/directFixtures.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { DirectPanel } from './index.js';
import { showDirect } from './directView.js';

const TEXTS = ['first from zoe', 'mine in between', 'the rude one', 'later from zoe'];
let mia;
let calls;

beforeEach(async () => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  mia = await newKeyPair();
  const zoe = await newKeyPair();
  const Z = { id: 8, pair: zoe, keyId: 9, publicKey: zoe.publicKey };
  const M = { id: 1, pair: mia, keyId: 1, publicKey: mia.publicKey };
  const messages = [
    await storedDirect(10, Z, M, { text: TEXTS[0] }),
    await storedDirect(11, M, Z, { text: TEXTS[1] }),
    await storedDirect(12, Z, M, { text: TEXTS[2] }),
    await storedDirect(13, Z, M, { text: TEXTS[3] }),
  ];
  calls = mockApi({
    ...signedIn({ id: 1, username: 'mia', role: 'member' }),
    'GET /chat/direct/8': {
      body: {
        ok: true,
        partner: { id: 8, username: 'zoe', online: false },
        partnerKey: { keyId: 9, publicKey: zoe.publicKey },
        keys: { 9: zoe.publicKey, 1: mia.publicKey },
        messages,
      },
    },
    'POST /chat/direct/8/read': { body: { ok: true } },
    'POST /chat/direct/8/report': { status: 201, body: { ok: true } },
  });
  act(() => showDirect({ id: 8, username: 'zoe' }));
  render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={mia.privateKey} />
    </SessionProvider>
  );
});

async function openReport() {
  const list = await screen.findByRole('list', { name: 'Private messages with zoe' });
  const rude = (await within(list).findByText(TEXTS[2])).closest('li');
  // Only the partner's messages can be reported.
  const mine = within(list).getByText(TEXTS[1]).closest('li');
  expect(within(mine).queryByRole('button', { name: 'Report' })).toBeNull();
  fireEvent.click(within(rude).getByRole('button', { name: 'Report' }));
  const dialog = screen.getByRole('dialog', { name: 'Report a message from zoe' });
  fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'insults' } });
  return dialog;
}

const reportBody = () => calls.find((c) => c.key === 'POST /chat/direct/8/report')?.body;

it('lists the conversation up to the reported message, that one selected', async () => {
  const dialog = await openReport();
  const boxes = within(within(dialog).getByRole('group', { name: 'Messages' })).getAllByRole(
    'checkbox'
  );
  expect(boxes.map((b) => b.closest('label').textContent)).toEqual(TEXTS.slice(0, 3));
  expect(boxes.map((b) => b.checked)).toEqual([false, false, true]);
  expect(
    within(dialog).getByLabelText('Share the selected messages with the moderators')
  ).not.toBeChecked();
});

it('without the tick, no message text is sent', async () => {
  const dialog = await openReport();
  fireEvent.click(within(dialog).getByLabelText(TEXTS[0]));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
  await vi.waitFor(() => expect(reportBody()).toEqual({ messageId: 12, reason: 'insults' }));
  const sent = JSON.stringify(calls.map((c) => c.body));
  for (const text of TEXTS) expect(sent).not.toContain(text);
  expect(await screen.findByText('Report sent. Thank you.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('with the tick, exactly the selected messages go along', async () => {
  const dialog = await openReport();
  fireEvent.click(within(dialog).getByLabelText(TEXTS[0]));
  fireEvent.click(within(dialog).getByLabelText('Share the selected messages with the moderators'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
  await vi.waitFor(() =>
    expect(reportBody()).toEqual({
      messageId: 12,
      reason: 'insults',
      shared: [
        { id: 10, text: TEXTS[0] },
        { id: 12, text: TEXTS[2] },
      ],
    })
  );
  const sent = JSON.stringify(calls.map((c) => c.body));
  expect(sent).not.toContain(TEXTS[1]);
  expect(sent).not.toContain(TEXTS[3]);
});
