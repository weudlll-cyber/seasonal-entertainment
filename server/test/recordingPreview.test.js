// ============================================================
// File:        recordingPreview.test.js
// Path:        server/test/recordingPreview.test.js
// Project:     Seasonal Entertainment
// Description: A recording's preview image (calls/recordingPreview.js, recordingPreviewRoutes.js;
//              docs/CALLS.md, "A recording's preview image"): organisers and admins set it (a
//              member or a guest is refused), by the chat images' rules; it is listed with the
//              recording and served to everyone; the share page uses it, and the logo again
//              after "Back to the logo"; a new one replaces the old's files; it is deleted with
//              its recording and with its call; setting and removing are audited.
// ============================================================

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setSetting } from '../src/settings/store.js';
import { liveCall, mp4Lasting, organiser, recordingApp } from './helpers/calls.js';
import { largePng, makeImage } from './helpers/media.js';
import { makeStaff, ORIGIN, registerUser } from './helpers/testApp.js';
import { PDF, uploadedFiles } from './helpers/uploads.js';

let t;
let dir;
let client;
afterEach(() => {
  t?.close();
  for (const folder of [dir, client]) if (folder) rmSync(folder, { recursive: true, force: true });
  client = undefined;
});

// The app with a built client of one index.html, for the share page.
function app() {
  client = mkdtempSync(path.join(tmpdir(), 'se-client-'));
  writeFileSync(
    path.join(client, 'index.html'),
    '<!doctype html><html><head><title>Seasonal Entertainment</title></head><body></body></html>'
  );
  ({ t, dir } = recordingApp({ clientDist: client }));
}

async function recorded(olga) {
  const call = await liveCall(olga, 'Preview call');
  await olga.post(`/api/calls/${call.id}/recording/start`);
  await olga.post(`/api/calls/${call.id}/recording/stop`);
  const { id, file } = t.db
    .prepare('SELECT id, file FROM call_recordings WHERE call_id = ?')
    .get(call.id);
  writeFileSync(path.join(dir, file), mp4Lasting(60));
  return { call, id };
}

const address = ({ call, id }) => `/api/calls/${call.id}/recordings/${id}/preview`;
const send = (agent, rec, buffer) =>
  agent.post(address(rec)).set('Content-Type', 'application/octet-stream').send(buffer);
const listed = async (rec) =>
  (await t.client().get(`/api/calls/recordings/${rec.id}`)).body.recording.preview;
const ogImage = async (rec) =>
  (await t.client().get(`/recordings/${rec.id}`)).text.match(
    /<meta property="og:image" content="([^"]*)" \/>/
  )?.[1];
const actions = () =>
  t.db
    .prepare("SELECT action, after FROM audit_log WHERE action LIKE 'call.recording_preview%'")
    .all();

describe('who may choose it', () => {
  it('organisers and admins; a member gets 403, a guest 401', async () => {
    app();
    const olga = await organiser(t);
    const rec = await recorded(olga);
    const { agent: mia } = await registerUser(t, 'mia');
    const png = await makeImage('png');
    expect((await send(mia, rec, png)).status).toBe(403);
    expect((await send(t.client(), rec, png)).status).toBe(401);
    expect((await mia.delete(address(rec))).status).toBe(403);
    expect(await listed(rec)).toBeNull();
    expect(uploadedFiles(t.config)).toEqual([]);

    expect((await send(olga, rec, png)).status).toBe(201);
    const { agent: ada } = await makeStaff(t, 'ada', 'admin');
    expect((await send(ada, rec, await makeImage('jpeg'))).status).toBe(201);
  });
});

describe('the image', () => {
  it('takes the chat images’ rules', async () => {
    app();
    const olga = await organiser(t);
    const rec = await recorded(olga);
    expect((await send(olga, rec, PDF)).body.message).toBe(
      'Allowed pictures: JPG, PNG, WebP and GIF.'
    );
    setSetting(t.db, 'chat.imageMaxMegapixels', 12);
    expect((await send(olga, rec, await largePng(5000, 3000))).status).toBe(400);
    setSetting(t.db, 'chat.uploadMaxMb', 1);
    expect((await send(olga, rec, Buffer.alloc(1.2 * 1024 * 1024))).status).toBe(413);
    expect(uploadedFiles(t.config)).toEqual([]);
  });

  it('is listed and served to everyone; the share page shows it, then the logo again', async () => {
    app();
    const olga = await organiser(t);
    const rec = await recorded(olga);
    expect(await ogImage(rec)).toBe(`${ORIGIN}/brand/logo.webp`);

    await send(olga, rec, await makeImage('png'));
    const preview = await listed(rec);
    for (const url of [preview.full, preview.thumb]) {
      const res = await t.client().get(url);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    }
    expect(await ogImage(rec)).toBe(`${ORIGIN}${preview.full}`);
    const page = (await t.client().get(`/recordings/${rec.id}`)).text;
    expect(page).toContain(
      `<meta name="twitter:image" content="${`${ORIGIN}${preview.full}`.replace(/&/g, '&amp;')}" />`
    );
    // The call's own list carries it too (the player's still image).
    const own = await t.client().get(`/api/calls/${rec.call.id}/recordings`);
    expect(own.body.recordings[0].preview).toEqual(preview);

    expect((await olga.delete(address(rec))).status).toBe(200);
    expect(await listed(rec)).toBeNull();
    expect(await ogImage(rec)).toBe(`${ORIGIN}/brand/logo.webp`);
    expect(uploadedFiles(t.config)).toEqual([]);
    expect((await t.client().get(preview.full)).status).toBe(404);
    expect(actions().map((a) => a.action)).toEqual([
      'call.recording_preview_set',
      'call.recording_preview_remove',
    ]);
    expect(JSON.parse(actions()[0].after)).toEqual({ title: 'Preview call', recording: rec.id });
  });

  it('a new one replaces the old: its files go, its address changes', async () => {
    app();
    const olga = await organiser(t);
    const rec = await recorded(olga);
    await send(olga, rec, await makeImage('png'));
    const first = uploadedFiles(t.config);
    const before = (await listed(rec)).full;
    await send(olga, rec, await makeImage('jpeg'));
    const second = uploadedFiles(t.config);
    expect(second).toHaveLength(2);
    expect(second.some((file) => first.includes(file))).toBe(false);
    expect((await listed(rec)).full).not.toBe(before);
  });
});

describe('deleting', () => {
  it('the recording takes its image with it', async () => {
    app();
    const olga = await organiser(t);
    const rec = await recorded(olga);
    await send(olga, rec, await makeImage('png'));
    expect(uploadedFiles(t.config)).toHaveLength(2);
    expect((await olga.delete(`/api/calls/${rec.call.id}/recordings/${rec.id}`)).status).toBe(200);
    expect(uploadedFiles(t.config)).toEqual([]);
  });

  it('the call takes its recordings’ images with it', async () => {
    app();
    const olga = await organiser(t);
    const rec = await recorded(olga);
    await send(olga, rec, await makeImage('png'));
    await olga.post(`/api/calls/${rec.call.id}/end`);
    const { agent: ada } = await makeStaff(t, 'ada', 'admin');
    expect((await ada.delete(`/api/calls/${rec.call.id}`)).status).toBe(200);
    expect(uploadedFiles(t.config)).toEqual([]);
  });
});
