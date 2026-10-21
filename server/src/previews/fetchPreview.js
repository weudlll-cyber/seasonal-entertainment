// ============================================================
// File:        fetchPreview.js
// Path:        server/src/previews/fetchPreview.js
// Project:     Seasonal Entertainment
// Description: Fetches one link's preview through safeFetch: the page (text/html only, capped)
//              and, if it names one, its image (fetchImage.js: checked, upright, without
//              metadata, scaled down, WebP). By default the image is stored in the media folder
//              at the configured width, so room viewers load it from this site; a direct
//              message's preview (directPreview.js) keeps it small and inline instead. Page
//              and image share one deadline.
// ============================================================

import { saveMediaFile } from '../media/files.js';
import { fetchImage } from './fetchImage.js';
import { parseMeta } from './parseMeta.js';
import { safeFetch } from './safeFetch.js';

// How a room preview keeps its image: in the media folder, served from this site.
const storedImage = (config) => ({
  maxWidth: config.linkPreviews.imageMaxWidth,
  keep: ({ data, width, height }) => ({
    file: saveMediaFile(config, data, 'webp', 'previews'),
    width,
    height,
  }),
});

async function previewImage(url, config, options, network, imageWay) {
  try {
    const image = await fetchImage(
      url,
      { maxBytes: config.linkPreviews.maxImageBytes, maxWidth: imageWay.maxWidth },
      options,
      network
    );
    return await imageWay.keep(image);
  } catch {
    return null; // the card still shows, just without an image
  }
}

// Resolves { title, description, siteName, image } or null (nothing usable, or refused).
// imageWay: { maxWidth, keep({ data, width, height }) -> the card's image }.
export async function fetchPreview(url, config, network, imageWay = storedImage(config)) {
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
  const image = meta.image
    ? await previewImage(meta.image, config, options, network, imageWay)
    : null;
  return { title: meta.title, description: meta.description, siteName: meta.siteName, image };
}
