// ============================================================
// File:        chatUploads.test.jsx
// Path:        client/src/chat/chatUploads.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards file uploads in the chat page: guests get no "Attach file", nor members
//              while the "File uploads in rooms" setting is off; a member's
//              file is uploaded, shown above the field and sent with the text as one message;
//              messages show images (thumbnail, full image on click), PDFs as a download card,
//              "File removed", and a moderator's "Remove file".
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import { GUEST, mockApi, signedIn, withSettings } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});

const IMAGE = {
  id: 5,
  kind: 'image',
  name: 'pic.png',
  bytes: 2048,
  thumbUrl: '/api/chat/files/5/thumb',
  url: '/api/chat/files/5/full',
};
const PDF = {
  id: 6,
  kind: 'pdf',
  name: 'report.pdf',
  bytes: 14336,
  downloadUrl: '/api/chat/files/6/download',
};
const message = (id, file, body = '') => ({
  id,
  room: 'general',
  author: 'mia',
  isGuest: false,
  kind: 'text',
  body,
  media: null,
  file,
  preview: null,
  createdAt: '2026-10-17T18:00:00.000Z',
  hiddenAt: null,
});

async function chat(session, { messages = [], moderator = false } = {}) {
  const calls = mockApi({
    ...session,
    'GET /chat/rooms': {
      body: {
        ok: true,
        rooms: [{ slug: 'general', name: 'General', canWrite: true }],
        me: { guestName: null, moderator },
      },
    },
    'GET /chat/rooms/general/messages': { body: { ok: true, messages } },
    'POST /chat/uploads?name=pic.png': { status: 201, body: { ok: true, upload: IMAGE } },
    'POST /chat/uploads?name=report.pdf': { status: 201, body: { ok: true, upload: PDF } },
    'POST /chat/rooms/general/messages': {
      status: 201,
      body: { ok: true, message: message(9, IMAGE, 'look') },
    },
    'POST /chat/messages/1/file/remove': { body: { ok: true } },
  });
  await renderApp('/chat');
  return calls;
}

const MIA = signedIn({ id: 1, username: 'mia', role: 'member' });
const choose = (file) =>
  fireEvent.change(screen.getByLabelText('File to attach'), { target: { files: [file] } });

describe('attaching a file', () => {
  it('guests get no upload button', async () => {
    await chat(GUEST);
    await screen.findByLabelText('Message');
    expect(screen.queryByRole('button', { name: 'Attach file' })).toBeNull();
  });

  it('members get none while the "File uploads in rooms" setting is off', async () => {
    await chat(withSettings(MIA, { 'chat.uploads': false }));
    await screen.findByLabelText('Message');
    expect(screen.queryByRole('button', { name: 'Attach file' })).toBeNull();
  });

  it('a member uploads an image; it waits above the field and goes out with the text', async () => {
    const calls = await chat(MIA);
    await screen.findByRole('button', { name: 'Attach file' });
    const file = new File(['png'], 'pic.png', { type: 'image/png' });
    choose(file);
    const attached = await screen.findByRole('group', { name: 'Attachment' });
    expect(within(attached).getByRole('img', { name: 'Picture: pic.png' })).toHaveAttribute(
      'src',
      IMAGE.thumbUrl
    );
    expect(calls.find((c) => c.key === 'POST /chat/uploads?name=pic.png').body).toBe(file);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'look' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /chat/rooms/general/messages')?.body).toEqual({
        body: 'look',
        attachment: { type: 'file', uploadId: 5 },
      })
    );
  });

  it('a PDF shows its name and size before sending', async () => {
    await chat(MIA);
    await screen.findByRole('button', { name: 'Attach file' });
    choose(new File(['%PDF-'], 'report.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('PDF: report.pdf (14 KB)')).toBeInTheDocument();
  });
});

describe('files in messages', () => {
  it('images open full size; PDFs are a download; removed files say so', async () => {
    await chat(GUEST, {
      messages: [message(1, IMAGE, 'pic'), message(2, PDF), message(3, { removed: true })],
    });
    const picture = await screen.findByRole('img', { name: 'Picture: pic.png' });
    expect(picture).toHaveAttribute('src', IMAGE.thumbUrl);
    expect(picture.closest('a')).toHaveAttribute('href', IMAGE.url);
    const pdf = screen.getByRole('group', { name: 'PDF: report.pdf' });
    const download = within(pdf).getByRole('link', { name: 'Download' });
    expect(download).toHaveAttribute('href', PDF.downloadUrl);
    expect(download).toHaveAttribute('download', 'report.pdf');
    expect(within(pdf).getByText('PDF, 14 KB')).toBeInTheDocument();
    expect(screen.getByText('File removed')).toBeInTheDocument();
  });

  it('a moderator removes a file; the placeholder appears', async () => {
    const calls = await chat(signedIn({ id: 2, username: 'olga', role: 'organiser' }), {
      messages: [message(1, IMAGE, 'pic')],
      moderator: true,
    });
    // Signed in first: the account arriving reloads the messages, which would undo the click.
    await screen.findByRole('link', { name: /^olga/ });
    fireEvent.click(await screen.findByRole('button', { name: /^Actions for the message from/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove file' }));
    expect(await screen.findByText('File removed')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /chat/messages/1/file/remove')).toBe(true);
  });
});
