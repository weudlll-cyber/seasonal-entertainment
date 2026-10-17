// ============================================================
// File:        fileSize.js
// Path:        client/src/chat/fileSize.js
// Project:     Seasonal Entertainment
// Description: A file size for people: "820 B", "14 KB", "2.4 MB".
// ============================================================

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
