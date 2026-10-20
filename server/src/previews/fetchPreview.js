// ============================================================
// File:        fetchPreview.js
// Path:        server/src/previews/fetchPreview.js
// Project:     Seasonal Entertainment
// Description: Fetches one link's preview through safeFetch: the page (text/html only, capped)
//              and, if it names one, its image (fetchImage.js: checked, upright, without
//              metadata, scaled to the configured width, WebP), stored in the media folder so
//              viewers load it from this site. Page and image share one deadline.
// ============================================================

import { saveMediaFile } from '../media/files.js';
import { fetchImage } from './fetchImage.js';
import { parseMeta } from './parseMeta.js';
import { safeFetch } from './safeFetch.js';

async function previewImage(url, config, options, network) {
  const limits = config.linkPreviews;
  try {
    const { data, width, height } = await fetchImage(
      url,
      { maxBytes: limits.maxImageBytes, maxWidth: limits.imageMaxWidth },
      options,
      network
    );
    return { file: saveMediaFile(config, data, 'webp', 'previews'), width, height };
  } catch {
    return null; // the card still shows, just without an image
  }
}

// Resolves { title, description, siteName, image } or null (nothing usable, or refused).
export async function fetchPreview(url, config, network) {
  const limits = config.linkPreviews;
  const options = {
    signal: AbortSignal.timeout(limits.timeoutMs),
    maxRedirects: limits.maxRedirects,
    userAgent: limits.userAgent,
  };
  const page = await safeFetch(
    url,
    { ...options, accept: ['text/html'], maxBytes: limits.maxHtmlBytes },
    network
  );
  if (page.status !== 200) return null;
  const meta = parseMeta(page.body.toString('utf8'), page.url, limits);
  if (!meta.title && !meta.description) return null;
  const image = meta.image ? await previewImage(meta.image, config, options, network) : null;
  return { title: meta.title, description: meta.description, siteName: meta.siteName, image };
}
