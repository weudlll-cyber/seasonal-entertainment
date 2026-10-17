// ============================================================
// File:        fetchPreview.js
// Path:        server/src/previews/fetchPreview.js
// Project:     Seasonal Entertainment
// Description: Fetches one link's preview through safeFetch: the page (text/html only, capped)
//              and, if it names one, its image. The image passes the media library's validator
//              (real type JPEG, PNG, WebP or GIF; size cap), is scaled down to the configured
//              width, re-encoded as WebP and stored in the media folder, so viewers load it from
//              this site. Page and image share one deadline.
// ============================================================

import sharp from 'sharp';
import { saveMediaFile } from '../media/files.js';
import { checkImage } from '../media/imageCheck.js';
import { parseMeta } from './parseMeta.js';
import { safeFetch } from './safeFetch.js';

async function previewImage(url, config, options, network) {
  const limits = config.linkPreviews;
  try {
    const res = await safeFetch(
      url,
      { ...options, accept: ['image/'], maxBytes: limits.maxImageBytes },
      network
    );
    if (res.status !== 200) return null;
    await checkImage(res.body, {
      types: ['jpeg', 'png', 'webp', 'gif'],
      maxBytes: limits.maxImageBytes,
    });
    const { data, info } = await sharp(res.body)
      .resize({ width: limits.imageMaxWidth, withoutEnlargement: true })
      .webp()
      .toBuffer({ resolveWithObject: true });
    return {
      file: saveMediaFile(config, data, 'webp', 'previews'),
      width: info.width,
      height: info.height,
    };
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
