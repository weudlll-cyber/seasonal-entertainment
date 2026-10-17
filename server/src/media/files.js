// ============================================================
// File:        files.js
// Path:        server/src/media/files.js
// Project:     Seasonal Entertainment
// Description: Media files on disk, in config.mediaDir (inside the gitignored data/ folder).
//              File names are always generated here (random + the checked type's extension),
//              never taken from an upload, so no name can reach outside the folder. Served at
//              MEDIA_URL_PREFIX by app.js.
// ============================================================

import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MEDIA_URL_PREFIX = '/media';

export const mediaUrl = (file) => `${MEDIA_URL_PREFIX}/${file}`;

// subfolder: '' for the library, 'previews' for link-preview images. Returns the stored name
// relative to the media folder ("ab12....webp" or "previews/ab12....webp").
export function saveMediaFile(config, buffer, ext, subfolder = '') {
  const dir = path.join(config.mediaDir, subfolder);
  mkdirSync(dir, { recursive: true });
  const name = `${randomBytes(16).toString('hex')}.${ext}`;
  writeFileSync(path.join(dir, name), buffer, { flag: 'wx' });
  return subfolder ? `${subfolder}/${name}` : name;
}

export function deleteMediaFile(config, file) {
  rmSync(path.join(config.mediaDir, file), { force: true });
}
