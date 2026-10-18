// ============================================================
// File:        calls-binary.mjs
// Path:        scripts/calls-binary.mjs
// Project:     Seasonal Entertainment
// Description: Gets the pinned LiveKit server binary for local development and the browser
//              tests: downloads the release archive for this platform into .calls-bin/
//              (gitignored), checks its SHA-256 against the value pinned below, unpacks it.
//              Run on its own (`node scripts/calls-binary.mjs`) it prints the binary's path.
//              Platforms without a release binary (macOS): see docs/CALLS.md, "Development".
// ============================================================

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIVEKIT_VERSION = '1.13.10';
// From the release's checksums (github.com/livekit/livekit/releases/tag/v1.13.10).
const ARCHIVES = {
  'win32-x64': {
    file: `livekit_${LIVEKIT_VERSION}_windows_amd64.zip`,
    sha256: 'fd4b7c2c3c1e4c71adaa4f6a046ad1c0abaaaf1e09fae904b35bf231ffae11d2',
  },
  'linux-x64': {
    file: `livekit_${LIVEKIT_VERSION}_linux_amd64.tar.gz`,
    sha256: 'c25a3e45fb922e9a93c6443d10c0ed041ba64342097e38632331736630283165',
  },
  'linux-arm64': {
    file: `livekit_${LIVEKIT_VERSION}_linux_arm64.tar.gz`,
    sha256: 'ff60607e1931ff078576882fa11c087aa5821d635ac0c47f56ff77e203e32006',
  },
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binDir = path.join(repoRoot, '.calls-bin', LIVEKIT_VERSION);
const binary = path.join(
  binDir,
  process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server'
);

// Returns the binary's path, downloading it first if needed. Throws on an unknown platform
// or a checksum mismatch (the download is then deleted, never run).
export async function ensureLiveKitBinary() {
  if (existsSync(binary)) return binary;
  const archive = ARCHIVES[`${process.platform}-${process.arch}`];
  if (!archive) {
    throw new Error(
      `No pinned LiveKit binary for ${process.platform}-${process.arch}; see docs/CALLS.md, "Development"`
    );
  }
  const url = `https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}/${archive.file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== archive.sha256) {
    throw new Error(`Checksum mismatch for ${archive.file}: got ${digest}`);
  }
  mkdirSync(binDir, { recursive: true });
  const archivePath = path.join(binDir, archive.file);
  writeFileSync(archivePath, bytes);
  // tar unpacks .tar.gz everywhere and .zip on Windows 10+ (bsdtar). On Windows the system's
  // own tar.exe: a GNU tar found first on PATH (Git Bash) reads "C:" as a remote host.
  const tar =
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
  const unpacked = spawnSync(tar, ['-xf', archivePath, '-C', binDir], { stdio: 'inherit' });
  rmSync(archivePath);
  if (unpacked.status !== 0 || !existsSync(binary)) throw new Error('Unpacking LiveKit failed');
  return binary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(await ensureLiveKitBinary());
}
