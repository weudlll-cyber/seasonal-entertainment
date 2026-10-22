// ============================================================
// File:        mp4Duration.js
// Path:        server/src/calls/mp4Duration.js
// Project:     Seasonal Entertainment
// Description: The playing length of a recorded MP4 file (docs/CALLS.md, "Recording"), read
//              from the file itself: its movie header ("mvhd" inside "moov") holds a time scale
//              and a duration. Only box headers are read on the way, never the media data, so a
//              long recording costs a few small reads. null when the file is missing or not a
//              complete MP4 (still being written, broken): then no length is shown.
// ============================================================

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

const HEADER = 8; // size (4) + type (4)

function readAt(fd, position, length) {
  const buffer = Buffer.alloc(length);
  const read = readSync(fd, buffer, 0, length, position);
  return read === length ? buffer : null;
}

// The duration in whole seconds from an "mvhd" box's content (version 0 or 1).
function fromMovieHeader(mvhd) {
  const version = mvhd[0];
  const timescale = version === 1 ? mvhd.readUInt32BE(20) : mvhd.readUInt32BE(12);
  const duration = version === 1 ? Number(mvhd.readBigUInt64BE(24)) : mvhd.readUInt32BE(16);
  return timescale > 0 ? Math.round(duration / timescale) : null;
}

// The child box of `type` within `box` (the content of a container box), or null.
function child(box, type) {
  for (let at = 0; at + HEADER <= box.length;) {
    const size = box.readUInt32BE(at);
    if (size < HEADER) return null;
    if (box.toString('latin1', at + 4, at + 8) === type)
      return box.subarray(at + HEADER, at + size);
    at += size;
  }
  return null;
}

export function mp4Duration(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    const end = fstatSync(fd).size;
    // The top-level boxes, header by header, until the movie box.
    for (let at = 0; at + HEADER <= end;) {
      const header = readAt(fd, at, HEADER);
      let size = header.readUInt32BE(0);
      let skip = HEADER;
      if (size === 1) {
        size = Number(readAt(fd, at + HEADER, 8).readBigUInt64BE(0)); // a 64-bit size follows
        skip += 8;
      } else if (size === 0) {
        size = end - at; // the last box, up to the end of the file
      }
      if (size < skip || at + size > end) return null;
      if (header.toString('latin1', 4, 8) === 'moov') {
        const mvhd = child(readAt(fd, at + skip, size - skip), 'mvhd');
        return mvhd ? fromMovieHeader(mvhd) : null;
      }
      at += size;
    }
    return null;
  } finally {
    closeSync(fd);
  }
}
