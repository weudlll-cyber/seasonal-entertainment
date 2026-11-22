#!/bin/bash
# ============================================================
# File:        recovery-key.test.sh
# Path:        deploy/test/recovery-key.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the installer's 2FA keys (keep_key, deploy/install/lib/config.sh;
#              docs/DEPLOYMENT.md): RECOVERY_CODE_KEY is made when site.env lacks it (32 random
#              bytes as base64, also on the --update that finds it missing), with its root-only
#              copy, both mode 600, and the KEEP SAFE note due; kept as it is when present (no
#              note); never printed; and SECRET_ENCRYPTION_KEY beside it untouched. Plain checks,
#              no framework; no root needed. Run: bash deploy/test/recovery-key.test.sh; CI runs
#              it. Exit code 1 on any failure.
# ============================================================

set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../install/lib" && pwd)"
# shellcheck source=SCRIPTDIR/../install/lib/common.sh
source "$LIB/common.sh"
# shellcheck source=SCRIPTDIR/../install/lib/config.sh
source "$LIB/config.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }

env="$work/site.env"
copy="$work/state/recovery-code-key"
bytes() { base64 -d <<<"$1" 2>/dev/null | wc -c; }

# A site.env as an install from before 2026-11-22 left it: the other key there, this one not.
kv_set "$env" SECRET_ENCRYPTION_KEY "$(new_secret base64)"
other="$(kv_get "$env" SECRET_ENCRYPTION_KEY)"
KEY_NOTE=shown
out="$(keep_key "$env" RECOVERY_CODE_KEY "$copy" 2>&1; echo "note=$KEY_NOTE")"
key="$(kv_get "$env" RECOVERY_CODE_KEY)"
if [[ "$(bytes "$key")" == 32 && "$key" =~ ^[A-Za-z0-9+/]+=*$ ]]; then ok 'a missing key is made: 32 bytes as base64'; else bad "key of $(bytes "$key") bytes"; fi
if [[ "$out" == *'note=pending'* ]]; then ok 'making it makes the KEEP SAFE note due'; else bad "note: $out"; fi
if [[ "$(cat "$copy")" == "$key" ]]; then ok 'the root-only copy holds it'; else bad 'the copy differs'; fi
if [[ "$(stat -c %a "$env")" == 600 && "$(stat -c %a "$copy")" == 600 ]]; then ok 'site.env and the copy are mode 600'; else bad "modes $(stat -c %a "$env") $(stat -c %a "$copy")"; fi
if [[ "$(stat -c %a "$(dirname "$copy")")" == 700 ]]; then ok 'the copy lies in a mode 700 folder'; else bad "folder mode $(stat -c %a "$(dirname "$copy")")"; fi
if [[ "$out" != *"$key"* && "$out" == 'note=pending' ]]; then ok 'nothing is printed, the key least of all'; else bad "printed: $out"; fi
if [[ "$(kv_get "$env" SECRET_ENCRYPTION_KEY)" == "$other" && "$other" != "$key" ]]; then ok 'SECRET_ENCRYPTION_KEY is untouched, and differs'; else bad 'SECRET_ENCRYPTION_KEY changed or equal'; fi

# A re-run (or --update) with the key there.
KEY_NOTE=shown
rm -f "$copy"
out="$(keep_key "$env" RECOVERY_CODE_KEY "$copy" 2>&1; echo "note=$KEY_NOTE")"
if [[ "$(kv_get "$env" RECOVERY_CODE_KEY)" == "$key" ]]; then ok 'a key already there is kept'; else bad 'the key changed on a re-run'; fi
if [[ "$out" == 'note=shown' ]]; then ok 'keeping it makes no note due and prints nothing'; else bad "re-run: $out"; fi
if [[ "$(cat "$copy")" == "$key" ]]; then ok 'a missing copy is written again from site.env'; else bad 'no copy after the re-run'; fi

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
