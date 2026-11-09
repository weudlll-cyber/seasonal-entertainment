#!/bin/bash
# ============================================================
# File:        loadtest.test.sh
# Path:        deploy/test/loadtest.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the call load test's plan (deploy/calls/loadtest.sh --dry-run; docs/CALLS.md,
#              "Load test"): three steps with 25, 50 and 100 subscribers and 3 video plus 2 audio
#              publishers, the generator pinned by digest on the host network against
#              ws://127.0.0.1:7880, capped at 2 CPUs and 2 GB, removed after (--rm), the keys only
#              through a temporary env file and never printed (also when taken from LIVEKIT_KEYS),
#              the stop rules named; without keys it stops and says so. Nothing is started.
#              Plain checks, no framework. Run: bash deploy/test/loadtest.test.sh; CI runs it.
#              Exit code 1 on any failure.
# ============================================================

set -u

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../calls" && pwd)/loadtest.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }
SECRET='a-test-secret-that-must-never-show'

printf 'LIVEKIT_API_KEY=testkey\nLIVEKIT_API_SECRET=%s\n' "$SECRET" >"$work/.env"
out="$(SE_LOADTEST_CALLS_DIR="$work" bash "$SCRIPT" --dry-run 2>&1)"
for n in 25 50 100; do
  if grep -q -- "--subscribers $n " <<<"$out"; then ok "a step with $n subscribers"; else bad "no step with $n"; fi
done
if [[ "$(grep -c -- '--video-publishers 3 --audio-publishers 2' <<<"$out")" == 3 ]]; then ok 'each step: 3 video and 2 audio publishers'; else bad 'publishers'; fi
if [[ "$(grep -c -- '--rm .*--network host --cpus 2 --memory 2g' <<<"$out")" == 3 ]]; then ok 'the generator: --rm, host network, 2 CPUs, 2 GB'; else bad 'limits'; fi
if grep -q 'livekit/livekit-cli@sha256:[0-9a-f]\{64\}' <<<"$out" && grep -q -- '--url ws://127.0.0.1:7880' <<<"$out"; then ok 'pinned by digest, local LiveKit'; else bad 'image or url'; fi
if grep -q 'load > 5' <<<"$out" && grep -q 'free memory < 1.5 GB' <<<"$out" && grep -q 'after 1200s' <<<"$out"; then ok 'the stop rules are named'; else bad 'stop rules'; fi
if [[ "$out" != *"$SECRET"* && "$out" == *'--env-file'* ]]; then ok 'the keys only through an env file, never printed'; else bad 'secret printed'; fi

# Only LIVEKIT_KEYS (an install without recording): found, still never printed.
printf 'LIVEKIT_KEYS=testkey: %s\n' "$SECRET" >"$work/.env"
out="$(SE_LOADTEST_CALLS_DIR="$work" bash "$SCRIPT" --dry-run 2>&1)"
if [[ $? -eq 0 && "$out" == *'Keys found'* && "$out" != *"$SECRET"* ]]; then ok 'LIVEKIT_KEYS alone is enough'; else bad "LIVEKIT_KEYS: $out"; fi

# No keys at all: it stops before anything.
printf 'CALLS_DOMAIN=calls.example.org\n' >"$work/.env"
out="$(SE_LOADTEST_CALLS_DIR="$work" bash "$SCRIPT" --dry-run 2>&1)"
if [[ $? -ne 0 && "$out" == *'no LiveKit key'* ]]; then ok 'without keys it stops'; else bad "no keys: $out"; fi

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
