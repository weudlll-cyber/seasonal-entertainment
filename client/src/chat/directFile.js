// ============================================================
// File:        directFile.js
// Path:        client/src/chat/directFile.js
// Project:     Seasonal Entertainment
// Description: Files in direct messages, the browser's part (docs/CHAT.md, "Files in direct
//              messages"): encrypt a chosen file with a fresh key (shared/crypto.js,
//              encryptFile) and upload only the ciphertext; fetch a received one and decrypt it;
//              and the safety rule for showing it. Only PNG, JPEG, GIF and WebP, recognised by
//              their first bytes after decryption (never by the name or the type the sender
//              stated), may be shown as a picture; everything else, SVG and HTML included, is
//              only ever offered as a download.
// ============================================================

import { upload } from '../api/http.js';

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');

const starts = (bytes, signature, at = 0) => signature.every((b, i) => bytes[at + i] === b);
const ascii = (text) => [...text].map((c) => c.charCodeAt(0));

// The picture type the bytes really are, or null: only these four are shown inline.
export function rasterType(bytes) {
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts(bytes, ascii('GIF87a')) || starts(bytes, ascii('GIF89a'))) return 'image/gif';
  if (starts(bytes, ascii('RIFF')) && starts(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

// Encrypts and uploads `file` (a File) for the partner. Returns what the composer shows and
// the message carries: { id, kind: 'image' | 'file', name, type, bytes, key, thumbUrl? }.
export async function uploadDirectFile(partnerId, file) {
  const { encryptFile } = await crypto();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { key, data } = await encryptFile(bytes);
  const answer = await upload(`/chat/direct/${partnerId}/files`, new Blob([data]), {});
  const type = rasterType(bytes);
  return {
    id: answer.file.id,
    kind: type ? 'image' : 'file',
    name: file.name.slice(0, 100),
    type: file.type,
    bytes: bytes.length,
    key,
    // Only the sender's own picture, from this device, before sending.
    ...(type && { thumbUrl: URL.createObjectURL(new Blob([bytes], { type })) }),
  };
}

// A received file's bytes, decrypted with the key from the message; null when it does not
// open (changed or cut short on the way).
export async function openDirectFile(file) {
  const { decryptFile } = await crypto();
  const res = await fetch(`/api/chat/direct/files/${file.id}`, { credentials: 'same-origin' });
  if (!res.ok) return null;
  return decryptFile(new Uint8Array(await res.arrayBuffer()), file.key);
}

// Offers the bytes as a download under the sender's name: always as plain data, so no browser
// renders it (an HTML or SVG file is never opened by the site).
export function downloadBytes(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// For a report (ReportDirectDialog): the reporter's browser decrypts each shared message's
// file and hands the plain copy to the moderators. shared: [{ id, file }].
export async function shareReportFiles(partnerId, reportId, shared) {
  for (const { id, file } of shared) {
    const bytes = await openDirectFile(file);
    if (!bytes) continue;
    await upload(`/chat/direct/${partnerId}/reports/${reportId}/files/${id}`, new Blob([bytes]), {
      name: file.name,
    });
  }
}
