// ============================================================
// File:        uploadAccess.test.js
// Path:        server/test/uploadAccess.test.js
// Project:     Seasonal Entertainment
// Description: Guards who gets an uploaded chat file and how: a member sends it with a message;
//              only the uploader can attach it, once; readers of the room get it, others 404;
//              a hidden message's file only for moderators; a pending file only for its
//              uploader; never through the public /media path; PDFs only as a sandboxed
//              download; a moderator's "Remove file" (disk, audit, placeholder); retention
//              deletes files with their messages and leaves no orphans.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runChatRetention } from '../src/chat/retention.js';
import { findUpload } from '../src/uploads/store.js';
import { auditActions, chatApp } from './helpers/chat.js';
import { makeImage } from './helpers/media.js';
import { makeStaff, registerUser } from './helpers/testApp.js';
import { PDF, sendFile, upload, uploadedFiles } from './helpers/uploads.js';

let t;
afterEach(() => t?.close());

async function start() {
  t = chatApp();
  const { agent: mia } = await registerUser(t, 'mia');
  const { agent: bob } = await registerUser(t, 'bob');
  const { agent: olga } = await makeStaff(t, 'olga', 'organiser');
  return { mia, bob, olga };
}

const uploadImage = async (agent) =>
  (await upload(agent, await makeImage('png'), 'pic.png')).body.upload;
const messages = async (agent, room = 'general') =>
  (await agent.get(`/api/chat/rooms/${room}/messages`)).body.messages;

describe('sending a file', () => {
  it('a member sends text and a file as one message; others see it', async () => {
    const { mia, bob } = await start();
    const file = await uploadImage(mia);
    const sent = await sendFile(mia, file.id, 'my picture');
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({
      body: 'my picture',
      file: { id: file.id, kind: 'image', name: 'pic.png' },
    });
    const seen = (await messages(bob))[0];
    expect((await bob.get(seen.file.thumbUrl)).status).toBe(200);
    expect((await t.client().get(seen.file.url)).status).toBe(200); // General: guests read too
  });

  it("only the uploader's own, not yet sent file can be attached", async () => {
    const { mia, bob } = await start();
    const file = await uploadImage(mia);
    expect((await sendFile(bob, file.id)).status).toBe(400);
    expect((await sendFile(mia, file.id)).status).toBe(201);
    expect((await sendFile(mia, file.id)).status).toBe(400);
    expect((await sendFile(mia, 999999)).status).toBe(400);
    expect(
      (
        await t
          .client()
          .post('/api/chat/rooms/general/messages')
          .send({ attachment: { type: 'file', uploadId: file.id } })
      ).status
    ).toBe(403);
  });
});

describe('who gets a file', () => {
  it('readers of the room only; anyone else gets 404, like an unknown file', async () => {
    const { mia } = await start();
    const file = await uploadImage(mia);
    await sendFile(mia, file.id, '', 'seasonal-race'); // members only
    const guest = await t.client().get(`/api/chat/files/${file.id}/full`);
    const unknown = await t.client().get('/api/chat/files/999999/full');
    expect([guest.status, unknown.status]).toEqual([404, 404]);
    expect(guest.body).toEqual(unknown.body);
    expect((await mia.get(`/api/chat/files/${file.id}/full`)).status).toBe(200);
  });

  it("a hidden message's file goes to moderators only", async () => {
    const { mia, bob, olga } = await start();
    const file = await uploadImage(mia);
    const { message } = (await sendFile(mia, file.id)).body;
    await olga.post(`/api/chat/messages/${message.id}/hide`);
    expect((await bob.get(`/api/chat/files/${file.id}/full`)).status).toBe(404);
    expect((await mia.get(`/api/chat/files/${file.id}/full`)).status).toBe(404);
    expect((await olga.get(`/api/chat/files/${file.id}/full`)).status).toBe(200);
  });

  it('a file not yet sent goes to its uploader only, and never through /media', async () => {
    const { mia, bob } = await start();
    const file = await uploadImage(mia);
    expect((await mia.get(file.thumbUrl)).status).toBe(200);
    expect((await bob.get(file.thumbUrl)).status).toBe(404);
    const onDisk = findUpload(t.db, file.id).file; // "uploads/<32 hex>.png"
    expect((await mia.get(`/media/${onDisk}`)).status).toBe(404);
    expect((await mia.get(`/media/x/../${onDisk}`)).status).toBe(404);
    expect((await mia.get(`/media/${onDisk.replace('/', '%2F')}`)).status).toBe(404);
  });

  it('a PDF only as a download: attachment, nosniff, sandboxed; never shown inline', async () => {
    const { mia } = await start();
    const { upload: pdf } = (await upload(mia, PDF, 'Season report.pdf')).body;
    await sendFile(mia, pdf.id);
    const res = await mia.get(pdf.downloadUrl);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="Season report.pdf"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['cache-control']).toBe('private, no-store');
    for (const variant of ['full', 'thumb']) {
      expect((await mia.get(`/api/chat/files/${pdf.id}/${variant}`)).status).toBe(404);
    }
  });
});

describe('moderation and retention', () => {
  it('"Remove file": gone from disk, audited, a placeholder stays', async () => {
    const { mia, olga } = await start();
    const file = await uploadImage(mia);
    const { message } = (await sendFile(mia, file.id, 'look')).body;
    const onDisk = path.join(t.config.mediaDir, findUpload(t.db, file.id).file);
    expect((await mia.post(`/api/chat/messages/${message.id}/file/remove`)).status).toBe(403);
    expect((await olga.post(`/api/chat/messages/${message.id}/file/remove`)).status).toBe(200);
    expect(existsSync(onDisk)).toBe(false);
    expect(uploadedFiles(t.config)).toEqual([]);
    expect((await messages(mia))[0]).toMatchObject({ body: 'look', file: { removed: true } });
    expect((await mia.get(`/api/chat/files/${file.id}/full`)).status).toBe(404);
    expect(auditActions(t)).toEqual(['chat.file_remove']);
  });

  it('retention deletes files with their messages, and unsent uploads; no orphans', async () => {
    const { mia } = await start();
    const kept = await uploadImage(mia);
    await sendFile(mia, kept.id, 'new');
    const old = await uploadImage(mia);
    const { message } = (await sendFile(mia, old.id, 'old')).body;
    const pending = await uploadImage(mia);
    t.db
      .prepare("UPDATE chat_messages SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?")
      .run(message.id);
    t.db
      .prepare("UPDATE chat_uploads SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?")
      .run(pending.id);
    const fresh = await uploadImage(mia); // pending, but recent: kept for now
    expect(runChatRetention(t.db, t.config)).toMatchObject({ messages: 1, uploadFiles: 4 });
    const left = t.db.prepare('SELECT id, file, thumb_file AS thumb FROM chat_uploads').all();
    expect(left.map((row) => row.id).sort()).toEqual([kept.id, fresh.id].sort());
    expect(uploadedFiles(t.config).sort()).toEqual(
      left
        .flatMap((row) => [row.file, row.thumb])
        .map((f) => f.replace('uploads/', ''))
        .sort()
    );
  });

  it('a message removed any other way takes its file along at the next run', async () => {
    const { mia } = await start();
    const file = await uploadImage(mia);
    const { message } = (await sendFile(mia, file.id)).body;
    t.db.prepare('DELETE FROM chat_messages WHERE id = ?').run(message.id);
    runChatRetention(t.db, t.config);
    expect(uploadedFiles(t.config)).toEqual([]);
    expect(findUpload(t.db, file.id)).toBeUndefined();
  });
});
