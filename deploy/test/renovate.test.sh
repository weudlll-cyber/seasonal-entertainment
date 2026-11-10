#!/bin/bash
# ============================================================
# File:        renovate.test.sh
# Path:        deploy/test/renovate.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the Renovate configuration (renovate.json; docs/DEPLOYMENT.md, "Dependency
#              updates"): its two regex managers still find the pins they are written for (the
#              CI's scanner images with tag and digest, the shellcheck image, the LiveKit binary's
#              version), so a reworded line cannot silently drop out of the updates; and the
#              LiveKit binary of the browser tests is the same version as the server image in
#              deploy/calls, as the "LiveKit server" group keeps them. Uses Node to apply the
#              regexes exactly as written. Plain checks, no framework.
#              Run: bash deploy/test/renovate.test.sh; CI runs it. Exit code 1 on any failure.
# ============================================================

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1

node --input-type=module - <<'EOF'
import { readFileSync, readdirSync } from 'node:fs';

const config = JSON.parse(readFileSync('renovate.json', 'utf8'));
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

// The files a manager reads ("/regex/" patterns), and every match of its matchStrings in them.
function matches(manager) {
  const patterns = manager.managerFilePatterns.map((p) => new RegExp(p.slice(1, -1)));
  const files = [
    ...readdirSync('.github/workflows').map((f) => `.github/workflows/${f}`),
    'scripts/calls-binary.mjs',
  ].filter((file) => patterns.some((p) => p.test(file)));
  return files.flatMap((file) =>
    manager.matchStrings.flatMap((s) =>
      [...readFileSync(file, 'utf8').matchAll(new RegExp(s, 'g'))].map((m) => m.groups)
    )
  );
}

const [images, livekit] = config.customManagers;
const found = matches(images);
for (const name of ['ghcr.io/gitleaks/gitleaks', 'ghcr.io/google/osv-scanner']) {
  const pin = found.find((g) => g.depName === name);
  check(Boolean(pin?.currentValue && pin?.currentDigest), `${name}: tag and digest found`);
}
check(
  found.some((g) => g.depName === 'koalaman/shellcheck' && g.currentValue),
  'koalaman/shellcheck: tag found'
);

const [binary] = matches(livekit);
check(Boolean(binary?.currentValue), `LiveKit binary version found (${binary?.currentValue})`);
const server = readFileSync('deploy/calls/docker-compose.yml', 'utf8').match(
  /livekit\/livekit-server:v([0-9.]+)@/
)?.[1];
check(binary?.currentValue === server, `the binary and the server image agree (${server})`);
check(
  config.packageRules.some(
    (r) =>
      r.groupName === 'LiveKit server' &&
      ['livekit/livekit-server', 'livekit/livekit'].every((n) => r.matchPackageNames.includes(n))
  ),
  'the LiveKit binary and server image are one group'
);

console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
EOF
