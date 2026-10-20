// ============================================================
// File:        fetchImage.js
// Path:        server/src/previews/fetchImage.js
// Project:     Seasonal Entertainment
// Description: Fetches one image from the internet through safeFetch (its network guard: https
//              on port 443, public addresses only, redirects checked, one deadline, a size cap)
//              and re-encodes it the way uploaded images are (uploads/process.js): the real type
//              checked by the media validator (JPEG, PNG, WebP or GIF), turned upright by its
//              orientation tag, every metadata block dropped, scaled down to a width and stored
//              as WebP. Used by link previews and by the event bot's images (bots/images.js).
// ============================================================

import sharp from 'sharp';
import { checkImage } from '../media/imageCheck.js';
import { safeFetch } from './safeFetch.js';

// limits: { maxBytes, maxWidth }; options: safeFetch's (signal or timeoutMs, maxRedirects,
// userAgent). Resolves { data, width, height } (WebP); throws when refused or not an image.
export async function fetchImage(url, limits, options, network) {
  const res = await safeFetch(
    url,
    { ...options, accept: ['image/'], maxBytes: limits.maxBytes },
    network
  );
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  await checkImage(res.body, { types: ['jpeg', 'png', 'webp', 'gif'], maxBytes: limits.maxBytes });
  // rotate() without an angle applies the orientation tag; sharp writes no metadata unless
  // asked, so EXIF (GPS), XMP and comments are gone.
  const { data, info } = await sharp(res.body)
    .rotate()
    .resize({ width: limits.maxWidth, withoutEnlargement: true })
    .webp()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
