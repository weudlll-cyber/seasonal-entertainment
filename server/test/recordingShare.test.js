// ============================================================
// File:        recordingShare.test.js
// Path:        server/test/recordingShare.test.js
// Project:     Seasonal Entertainment
// Description: A recording's share page (calls/recordingShare.js; docs/CALLS.md, "Sharing a
//              recording"): /recordings/:id answers the client's index.html with the preview
//              card's meta tags (title, date and length, URL, the site's logo, the public video
//              with its type and size), every value escaped, the page's own title replaced; a
//              missing, deleted, running or malformed one answers 404 with the plain page. The
//              API gives the one recording with its call for everyone.
// ============================================================

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { liveCall, mp4Lasting, organiser, recordingApp } from './helpers/calls.js';
import { ORIGIN } from './helpers/testApp.js';

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Seasonal Entertainment</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

let t;
let dir;
let client;
afterEach(() => {
  t?.close();
  for (const folder of [dir, client]) rmSync(folder, { recursive: true, force: true });
});

// The app with a built client of one index.html.
function app() {
  client = mkdtempSync(path.join(tmpdir(), 'se-client-'));
  writeFileSync(path.join(client, 'index.html'), INDEX);
  ({ t, dir } = recordingApp({ clientDist: client }));
}

async function recorded(olga, title, seconds) {
  const call = await liveCall(olga, title);
  await olga.post(`/api/calls/${call.id}/recording/start`);
  await olga.post(`/api/calls/${call.id}/recording/stop`);
  const { id, file } = t.db
    .prepare('SELECT id, file FROM call_recordings WHERE call_id = ?')
    .get(call.id);
  writeFileSync(path.join(dir, file), mp4Lasting(seconds));
  return { call, id };
}

const meta = (html, key) =>
  html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)" />`))?.[1];

it('answers the page with the preview card of that recording, values escaped', async () => {
  app();
  const olga = await organiser(t);
  const { call, id } = await recorded(olga, 'Q&A <night> "live"', 754);

  const res = await t.client().get(`/recordings/${id}`);
  expect(res.status).toBe(200);
  expect(res.type).toBe('text/html');
  const html = res.text;
  expect(meta(html, 'og:title')).toBe('Q&amp;A &lt;night&gt; &quot;live&quot; (recording)');
  expect(html).not.toContain('<night>');
  expect(meta(html, 'og:description')).toMatch(/^Community call recording, .+\sUTC · 12:34\.$/);
  expect(meta(html, 'og:url')).toBe(`${ORIGIN}/recordings/${id}`);
  expect(meta(html, 'og:type')).toBe('video.other');
  expect(meta(html, 'og:image')).toBe(`${ORIGIN}/brand/logo.webp`);
  const video = `${ORIGIN}/api/calls/${call.id}/recordings/${id}/video`;
  expect(meta(html, 'og:video')).toBe(video);
  expect(meta(html, 'og:video:secure_url')).toBe(video);
  expect(meta(html, 'og:video:type')).toBe('video/mp4');
  expect([meta(html, 'og:video:width'), meta(html, 'og:video:height')]).toEqual(['1280', '720']);
  expect(meta(html, 'twitter:card')).toBe('summary_large_image');
  // One title, the recording's; the client's root is still there.
  expect(html.match(/<title>/g)).toHaveLength(1);
  expect(html).toContain('<title>Q&amp;A &lt;night&gt; &quot;live&quot; (recording)');
  expect(html).toContain('<div id="root"></div>');

  // The API the page reads: the recording with its call, for everyone.
  const api = await t.client().get(`/api/calls/recordings/${id}`);
  expect(api.body.recording).toMatchObject({ id, callId: call.id, seconds: 754 });
  expect(api.body.recording.title).toBe('Q&A <night> "live"');
  expect(api.body.canManage).toBe(false);
});

it('answers 404 with the plain page for a missing, running, deleted or malformed one', async () => {
  app();
  const olga = await organiser(t);
  const { call, id } = await recorded(olga, 'Town hall', 60);
  const running = await liveCall(olga, 'Still on');
  await olga.post(`/api/calls/${running.id}/recording/start`);
  const runningId = t.db
    .prepare('SELECT id FROM call_recordings WHERE call_id = ?')
    .get(running.id).id;

  const plain = async (pathname) => {
    const res = await t.client().get(pathname);
    expect(res.status, pathname).toBe(404);
    expect(res.text).toBe(INDEX);
  };
  await plain(`/recordings/${id + 100}`);
  await plain(`/recordings/${runningId}`);
  await plain('/recordings/1abc');
  expect((await t.client().get(`/api/calls/recordings/${runningId}`)).status).toBe(404);

  await olga.delete(`/api/calls/${call.id}/recordings/${id}`);
  await plain(`/recordings/${id}`);
  expect((await t.client().get(`/api/calls/recordings/${id}`)).status).toBe(404);
});
