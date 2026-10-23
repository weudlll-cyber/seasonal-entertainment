// ============================================================
// File:        directFiles.test.jsx
// Path:        client/src/chat/directFiles.test.jsx
// Project:     Seasonal Entertainment
// Description: Files in direct messages with real cryptography (directFile.js, DirectFile.jsx,
//              DirectConversation): the chosen file leaves the browser only encrypted, and its
//              key, name and type only inside the encrypted message; the recipient decrypts it;
//              only a real PNG, JPEG, GIF or WebP (by its bytes) is shown as a picture, and an
//              SVG or HTML file — even one named and typed as a picture — only as a download;
//              reporting a message with a file shares the file decrypted by the reporter. While
//              the "Files in direct messages" setting is off, the composer has no file button.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decryptDirect,
  decryptFile,
  encryptFile,
  newKeyPair,
} from '@seasonal-entertainment/shared/crypto.js';
import { SessionProvider } from '../session/SessionContext.jsx';
import { storedDirect } from '../test/directFixtures.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn, withSettings } from '../test/mockApi.js';
import { rasterType } from './directFile.js';
import { DirectPanel } from './index.js';
import { showDirect } from './directView.js';

const ZOE = { id: 8, username: 'zoe' };
// Whether `part` occurs anywhere in `bytes`.
const contains = (bytes, part) => bytes.some((_, at) => part.every((b, i) => bytes[at + i] === b));
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
// Copied into this realm's Uint8Array: jsdom's TextEncoder hands out another realm's, which
// libsodium does not accept.
const ascii = (text) => Uint8Array.from(new TextEncoder().encode(text));
const SVG = ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = ascii('<!doctype html><script>alert(1)</script>');
let mia;
let zoe;

beforeEach(async () => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  // jsdom has no object URLs: a recognisable stand-in.
  URL.createObjectURL = vi.fn(() => 'blob:decrypted');
  URL.revokeObjectURL = vi.fn();
  act(() => showDirect(null));
  [mia, zoe] = [await newKeyPair(), await newKeyPair()];
});

// files: { [id]: encrypted bytes } served by GET /chat/direct/files/:id.
async function open({ messages = [], files = {}, extra = {} } = {}) {
  const calls = mockApi({
    ...signedIn({ id: 1, username: 'mia', role: 'member' }),
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
    ...Object.fromEntries(
      Object.entries(files).map(([id, bytes]) => [`GET /chat/direct/files/${id}`, { bytes }])
    ),
    ...extra,
  });
  act(() => showDirect(ZOE));
  render(
    <SessionProvider>
      <DirectPanel keyId={1} privateKey={mia.privateKey} />
    </SessionProvider>
  );
  const list = await screen.findByRole('list', { name: 'Private messages with zoe' });
  return { calls, list };
}

// A message from zoe carrying a file: the file encrypted, stored as id 5.
async function received(bytes, name, type) {
  const { key, data } = await encryptFile(bytes);
  const file = { id: 5, key, name, type, bytes: bytes.length };
  const message = await storedDirect(
    20,
    { id: 8, pair: zoe, keyId: 9 },
    { id: 1, publicKey: mia.publicKey, keyId: 1 },
    { text: 'here', file }
  );
  return { message, files: { 5: data } };
}

describe('the safety rule', () => {
  it('only real PNG, JPEG, GIF and WebP bytes count as a picture', () => {
    expect(rasterType(PNG)).toBe('image/png');
    expect(rasterType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(rasterType(ascii('GIF89a...'))).toBe('image/gif');
    expect(rasterType(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(rasterType(SVG)).toBeNull();
    expect(rasterType(HTML)).toBeNull();
    expect(rasterType(ascii('RIFF\0\0\0\0WAVE'))).toBeNull();
  });
});

describe('sending', () => {
  it('no file button while the "Files in direct messages" setting is off', async () => {
    const mia = signedIn({ id: 1, username: 'mia', role: 'member' });
    await open({ extra: withSettings(mia, { 'chat.directFiles': false }) });
    await screen.findByLabelText('Message');
    expect(screen.queryByLabelText('File to attach')).toBeNull();
  });

  it('the file leaves encrypted; its key, name and type only inside the message', async () => {
    const { calls } = await open({
      extra: {
        'POST /chat/direct/8/files?': { status: 201, body: { ok: true, file: { id: 5 } } },
        'POST /chat/direct/8': { status: 201, body: { ok: true } },
      },
    });
    const chosen = new File([PNG], 'holiday.png', { type: 'image/png' });
    // The composer comes once the conversation (and the partner's key) has loaded.
    const input = await screen.findByLabelText('File to attach');
    fireEvent.change(input, { target: { files: [chosen] } });
    await screen.findByRole('group', { name: 'Attachment' });
    const sentFile = calls.find((c) => c.key.startsWith('POST /chat/direct/8/files'));
    expect(sentFile.key).toBe('POST /chat/direct/8/files?'); // no name in the address
    const uploaded = new Uint8Array(await sentFile.body.arrayBuffer());
    expect(contains(uploaded, PNG)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => expect(calls.some((c) => c.key === 'POST /chat/direct/8')).toBe(true));
    const { body } = calls.find((c) => c.key === 'POST /chat/direct/8');
    expect(body.fileId).toBe(5);
    expect(JSON.stringify(body)).not.toContain('holiday');
    const { file } = await decryptDirect(body, mia.publicKey, zoe.privateKey);
    expect(file).toMatchObject({
      id: 5,
      name: 'holiday.png',
      type: 'image/png',
      bytes: PNG.length,
    });
    expect(await decryptFile(uploaded, file.key)).toEqual(PNG);
  });
});

describe('receiving', () => {
  it('a picture is decrypted and shown', async () => {
    const { message, files } = await received(PNG, 'holiday.png', 'image/png');
    const { list } = await open({ messages: [message], files });
    const picture = await within(list).findByRole('img', { name: 'holiday.png' });
    expect(picture).toHaveAttribute('src', 'blob:decrypted');
    const [blob] = URL.createObjectURL.mock.calls.at(-1);
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PNG);
  });

  it.each([
    ['an SVG named and typed as a picture', SVG, 'cat.png', 'image/png'],
    ['an SVG', SVG, 'cat.svg', 'image/svg+xml'],
    ['an HTML file', HTML, 'page.html', 'text/html'],
  ])('%s is never shown, only offered as a download', async (_what, bytes, name, type) => {
    const { message, files } = await received(bytes, name, type);
    const { list } = await open({ messages: [message], files });
    const download = await within(list).findByRole('button', { name: `Download ${name}` });
    await vi.waitFor(() => expect(download).toBeEnabled());
    expect(within(list).queryByRole('img')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(download);
    const [blob] = URL.createObjectURL.mock.calls.at(-1);
    expect(blob.type).toBe('application/octet-stream');
  });

  it("reporting a message shares its file, decrypted in the reporter's browser", async () => {
    const { message, files } = await received(PNG, 'holiday.png', 'image/png');
    const { calls, list } = await open({
      messages: [message],
      files,
      extra: {
        'POST /chat/direct/8/report': { status: 201, body: { ok: true, reportId: 3 } },
        'POST /chat/direct/8/reports/3/files/20?name=holiday.png': {
          status: 201,
          body: { ok: true },
        },
      },
    });
    const item = (await within(list).findByText('here')).closest('li');
    fireEvent.click(within(item).getByRole('button', { name: 'Actions for the message from zoe' }));
    fireEvent.click(within(item).getByRole('menuitem', { name: 'Report' }));
    const dialog = screen.getByRole('dialog', { name: 'Report a message from zoe' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'unwanted' } });
    fireEvent.click(
      within(dialog).getByLabelText('Share the selected messages with the moderators')
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await vi.waitFor(() =>
      expect(calls.some((c) => c.key.startsWith('POST /chat/direct/8/reports/3/files/20'))).toBe(
        true
      )
    );
    const shared = calls.find((c) => c.key.startsWith('POST /chat/direct/8/reports/3/files/20'));
    expect(new Uint8Array(await shared.body.arrayBuffer())).toEqual(PNG);
  });
});
