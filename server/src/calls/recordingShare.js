// ============================================================
// File:        recordingShare.js
// Path:        server/src/calls/recordingShare.js
// Project:     Seasonal Entertainment
// Description: The share page of one recording, /recordings/:id (docs/CALLS.md, "Sharing a
//              recording"; decided 2026-11-10: recordings stay public, each with a stable link
//              that shows a preview card where it is posted). The server answers the path with
//              the client's index.html plus Open Graph and Twitter meta tags for that recording
//              (the call's title, the date in UTC, labelled "UTC" (UTC_ZONE, as the weekly
//              recap) and the length, the page's URL, the site's logo
//              as the image, the public video as og:video), every value HTML-escaped; the client
//              then shows the page (pages/RecordingPage.jsx). A missing, deleted or unfinished
//              recording, or calls or recording not set up, answer 404 with the plain
//              index.html, so the client shows its normal "not found". Only where the built
//              client is served (production); the Vite dev server answers without the tags.
// ============================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatDuration } from '@seasonal-entertainment/shared/chapterRules.js';
import { UTC_ZONE, formatDateTime } from '@seasonal-entertainment/shared/localWeek.js';
import { selfOrigin } from '../http/csrf.js';
import { findListedRecording } from './recordings.js';
import { RECORDING_ENCODING } from './service.js';

const SITE_NAME = 'Seasonal Entertainment';
// The site's own brand image (client/public/brand), no picture made per recording.
const IMAGE_PATH = '/brand/logo.webp';

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

// The meta tags of a found recording (findListedRecording's shape); origin: the site's.
export function shareTags(recording, origin) {
  const url = `${origin}/recordings/${recording.id}`;
  const video = `${origin}/api/calls/${recording.callId}/recordings/${recording.id}/video`;
  // In UTC with its label: the card is read by everyone it is posted to, in any zone.
  const when = formatDateTime(recording.startedAt, UTC_ZONE);
  const length = recording.seconds === null ? '' : ` · ${formatDuration(recording.seconds)}`;
  const title = `${recording.title} (recording)`;
  const description = `Community call recording, ${when}${length}.`;
  const tags = [
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:type', 'video.other'],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', url],
    ['property', 'og:image', `${origin}${IMAGE_PATH}`],
    ['property', 'og:video', video],
    ['property', 'og:video:secure_url', video],
    ['property', 'og:video:type', 'video/mp4'],
    ['property', 'og:video:width', RECORDING_ENCODING.width],
    ['property', 'og:video:height', RECORDING_ENCODING.height],
    // A "player" card needs an embeddable player page of its own; the large summary links here.
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', `${origin}${IMAGE_PATH}`],
  ];
  return [
    `<title>${escapeHtml(`${title} · ${SITE_NAME}`)}</title>`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    ...tags.map(([key, name, value]) => `<meta ${key}="${name}" content="${escapeHtml(value)}" />`),
  ].join('\n    ');
}

// GET /recordings/:id. config.calls.recording: { dir } when recording is set up; service: the
// call service or null.
export function recordingSharePage(db, config, service) {
  const indexFile = path.join(config.clientDist, 'index.html');
  return (req, res) => {
    // Read per request: a new deployment's index.html is used at once (it is small).
    const html = readFileSync(indexFile, 'utf8');
    const dir = service && config.calls?.recording?.dir;
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0;
    const found = dir ? findListedRecording(db, id, dir) : null;
    res.set('Cache-Control', 'no-cache');
    if (!found) return res.status(404).type('html').send(html);
    // The page's own <title> gives way to the recording's.
    const tagged = html
      .replace(/<title>[^<]*<\/title>/, '')
      .replace('</head>', `  ${shareTags(found, selfOrigin(req, config))}\n  </head>`);
    res.type('html').send(tagged);
  };
}
