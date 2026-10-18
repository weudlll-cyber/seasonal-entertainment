// ============================================================
// File:        uploads.js
// Path:        server/test/helpers/uploads.js
// Project:     Seasonal Entertainment
// Description: Chat upload test helpers: upload a file as a member, send it with a message,
//              and test files (a JPEG carrying GPS EXIF and an orientation tag, a tiny PDF).
// ============================================================

import { readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const upload = (agent, buffer, name = 'photo.jpg') =>
  agent
    .post('/api/chat/uploads')
    .query({ name })
    .set('Content-Type', 'application/octet-stream')
    .send(buffer);

export const sendFile = (agent, uploadId, body = '', room = 'general') =>
  agent
    .post(`/api/chat/rooms/${room}/messages`)
    .send({ body, attachment: { type: 'file', uploadId } });

// 40 x 20 pixels, but tagged "rotate 90°" (orientation 6), with camera and GPS EXIF.
export const gpsJpeg = () =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: '#c83' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestCam' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '48/1 8/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '11/1 34/1 0/1',
      },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

// Files under the media folder's uploads/ (none when the folder does not exist yet).
export function uploadedFiles(config) {
  try {
    return readdirSync(path.join(config.mediaDir, 'uploads'));
  } catch {
    return [];
  }
}
