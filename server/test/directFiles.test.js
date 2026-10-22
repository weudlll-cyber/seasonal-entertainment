// ============================================================
// File:        directFiles.test.js
// Path:        server/test/directFiles.test.js
// Project:     Seasonal Entertainment
// Description: Guards files in direct messages (directFiles/): the server stores exactly the
//              ciphertext the browser uploaded (no plaintext anywhere on disk); only the two
//              members get it (anyone else 404, guests 401, a pending one only its uploader);
//              the recipient decrypts it; a file can be sent once, by its uploader, to that
//              partner; the room upload size applies; a reported message's file, shared by
//              the reporter's browser, reaches moderators only (audited); a deleted message, or
//              account, takes its file off the disk.
// ============================================================

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { decryptFile, encryptFile } from '@seasonal-entertainment/shared/crypto.js';
import { runChatRetention } from '../src/chat/retention.js';
import { auditActions } from './helpers/chat.js';
import { readDirect, sendDirect } from './helpers/direct.js';
import { memberWithKey } from './helpers/keys.js';
import { makeStaff, makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const CANARY = 'plaintext-canary-of-a-direct-file';
const directFolder = () => path.join(t.config.mediaDir, 'direct');
const stored = () => (existsSync(directFolder()) ? readdirSync(directFolder()) : []);

async function members(overrides) {
  t = makeTestApp(overrides);
  return {
    anna: await memberWithKey(t, 'anna'),
    ben: await memberWithKey(t, 'ben'),
    carol: await memberWithKey(t, 'carol'),
  };
}

const upload = (from, to, bytes) =>
  from.agent
    .post(`/api/chat/direct/${to.user.id}/files`)
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from(bytes));
const fetchFile = (who, id) =>
  who.agent
    .get(`/api/chat/direct/files/${id}`)
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });

// anna sends ben an encrypted file; returns { key, data, fileId, messageId }.
async function sentFile({ anna, ben }) {
  const { key, data } = await encryptFile(new TextEncoder().encode(CANARY));
  const up = await upload(anna, ben, data);
  expect(up.status).toBe(201);
  const fileId = up.body.file.id;
  const payload = { text: '', file: { id: fileId, key, name: 'note.txt', type: 'text/plain' } };
  const sent = await sendDirect(anna, ben.user, payload, { fileId });
  expect(sent.status).toBe(201);
  return { key, data, fileId, messageId: sent.body.message.id };
}

describe('files in direct messages', () => {
  it('the server stores the ciphertext only; the recipient decrypts it', async () => {
    const m = await members();
    const { data, fileId } = await sentFile(m);
    const [name] = stored();
    const onDisk = readFileSync(path.join(directFolder(), name));
    expect(onDisk.equals(Buffer.from(data))).toBe(true);
    expect(onDisk.includes(CANARY)).toBe(false);
    // Ben reads the message (the key is inside it), fetches and decrypts the file.
    const { messages } = await readDirect(m.ben, m.anna.user);
    const { file } = messages.at(-1).payload;
    const res = await fetchFile(m.ben, fileId);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/octet-stream/);
    const plain = await decryptFile(new Uint8Array(res.body), file.key);
    expect(new TextDecoder().decode(plain)).toBe(CANARY);
  });

  it('anyone but the two members gets 404; guests 401; a pending file only its uploader', async () => {
    const m = await members();
    const { data } = await encryptFile(new Uint8Array(10));
    const pending = (await upload(m.anna, m.ben, data)).body.file.id;
    expect((await fetchFile(m.anna, pending)).status).toBe(200);
    expect((await fetchFile(m.ben, pending)).status).toBe(404);
    const { fileId } = await sentFile(m);
    expect((await fetchFile(m.carol, fileId)).status).toBe(404);
    expect((await request(t.app).get(`/api/chat/direct/files/${fileId}`)).status).toBe(401);
    expect((await fetchFile(m.anna, fileId)).status).toBe(200);
  });

  it('a file goes once, by its uploader, to that partner', async () => {
    const m = await members();
    const { fileId } = await sentFile(m);
    const again = await sendDirect(m.anna, m.ben.user, { text: 'x' }, { fileId });
    expect(again.status).toBe(400);
    const { data } = await encryptFile(new Uint8Array(10));
    const forBen = (await upload(m.anna, m.ben, data)).body.file.id;
    expect((await sendDirect(m.carol, m.ben.user, { text: 'x' }, { fileId: forBen })).status).toBe(
      400
    );
    expect((await sendDirect(m.anna, m.carol.user, { text: 'x' }, { fileId: forBen })).status).toBe(
      400
    );
  });

  it('the room upload size applies (plus the encryption overhead)', async () => {
    // The room upload rules with a small per-file size (the others as configured).
    const uploads = {
      maxBytes: 1000,
      dailyBytes: 1e6,
      thumbWidth: 480,
      pendingMinutes: 60,
      nameMax: 100,
    };
    const m = await members({ uploads });
    const fits = await encryptFile(new Uint8Array(1000));
    expect((await upload(m.anna, m.ben, fits.data)).status).toBe(201);
    const big = await encryptFile(new Uint8Array(1200));
    expect((await upload(m.anna, m.ben, big.data)).status).toBe(413);
  });

  it("a reported message's file, shared by the reporter, reaches moderators only", async () => {
    const m = await members();
    const { messageId } = await sentFile(m);
    const report = await m.ben.agent.post(`/api/chat/direct/${m.anna.user.id}/report`).send({
      messageId,
      reason: 'unwanted file',
      shared: [{ id: messageId, text: '' }],
    });
    const { reportId } = report.body;
    const share = (who, partner) =>
      who.agent
        .post(
          `/api/chat/direct/${partner.user.id}/reports/${reportId}/files/${messageId}?name=note.txt`
        )
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(CANARY));
    expect((await share(m.anna, m.ben)).status).toBe(404); // not her report
    expect((await share(m.ben, m.anna)).status).toBe(201);
    expect((await share(m.ben, m.anna)).status).toBe(409); // once
    const { agent: mod } = await makeStaff(t, 'olga', 'organiser');
    const { copies } = (await mod.get(`/api/chat/direct-reports/${reportId}/copies`)).body;
    expect(copies[0].file).toEqual({ name: 'note.txt', bytes: CANARY.length });
    const url = `/api/chat/direct-reports/${reportId}/files/${messageId}`;
    expect((await m.ben.agent.get(url)).status).toBe(403);
    const download = await mod.get(url);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(String(download.body)).toBe(CANARY);
    expect(auditActions(t)).toContain('chat.direct_report_file_view');
  });

  it('a deleted message takes its file off the disk; so does a deleted account', async () => {
    const m = await members();
    const { fileId, messageId } = await sentFile(m);
    expect(stored()).toHaveLength(1);
    t.db.prepare('DELETE FROM direct_messages WHERE id = ?').run(messageId);
    runChatRetention(t.db, t.config);
    expect(stored()).toEqual([]);
    expect((await fetchFile(m.anna, fileId)).status).toBe(404);
    await sentFile(m);
    expect(stored()).toHaveLength(1);
    t.db.prepare('DELETE FROM users WHERE id = ?').run(m.anna.user.id);
    runChatRetention(t.db, t.config);
    expect(stored()).toEqual([]);
  });
});
