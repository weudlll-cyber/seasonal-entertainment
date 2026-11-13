#!/bin/bash
# ============================================================
# File:        push.test.sh
# Path:        deploy/test/push.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the installer's web push keys (deploy/install/lib/push.sh;
#              docs/DEPLOYMENT.md, "Web push"): a first run makes a P-256 pair into site.env
#              (base64url, 65 and 32 bytes, the public key the private one's; checked with
#              Node's crypto where Node is installed), mode 600, neither key ever printed; a
#              re-run keeps the pair as it is; a half pair is made again whole. Plain checks, no
#              framework; no root needed. Run: bash deploy/test/push.test.sh; CI runs it. Exit
#              code 1 on any failure.
# ============================================================

set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../install/lib" && pwd)"
# shellcheck source=SCRIPTDIR/../install/lib/common.sh
source "$LIB/common.sh"
# shellcheck source=SCRIPTDIR/../install/lib/config.sh
source "$LIB/config.sh"
# shellcheck source=SCRIPTDIR/../install/lib/push.sh
source "$LIB/push.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }

env="$work/site.env"
bytes() { tr '_-' '/+' <<<"$1" | awk '{ n = length($0) % 4; printf "%s", $0; while (n && n++ < 4) printf "=" }' | base64 -d 2>/dev/null | wc -c; }

out="$(push_site_env "$env" 2>&1)"
public="$(kv_get "$env" VAPID_PUBLIC_KEY)"
private="$(kv_get "$env" VAPID_PRIVATE_KEY)"
if [[ "$(bytes "$public")" == 65 && "$(bytes "$private")" == 32 ]]; then ok 'a first run makes a public key of 65 bytes and a private one of 32'; else bad "key sizes: $(bytes "$public") $(bytes "$private")"; fi
if [[ "$public" =~ ^[A-Za-z0-9_-]+$ && "$private" =~ ^[A-Za-z0-9_-]+$ ]]; then ok 'both base64url, without padding'; else bad 'not base64url'; fi
if [[ "$(stat -c %a "$env")" == 600 ]]; then ok 'site.env stays mode 600'; else bad "mode $(stat -c %a "$env")"; fi
if [[ "$out" != *"$public"* && "$out" != *"$private"* && "$out" == *'never shown'* ]]; then ok 'neither key is printed'; else bad 'a key was printed'; fi
if command -v node >/dev/null; then
  derived="$(VAPID_PRIVATE_KEY="$private" node -e "
    const ecdh = require('node:crypto').createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(process.env.VAPID_PRIVATE_KEY, 'base64url'));
    process.stdout.write(ecdh.getPublicKey().toString('base64url'));")"
  if [[ "$derived" == "$public" ]]; then ok 'the public key is the private key'"'"'s'; else bad 'not a pair'; fi
else
  echo 'skip the pair check (no Node here)'
fi

push_site_env "$env" >/dev/null 2>&1
if [[ "$(kv_get "$env" VAPID_PUBLIC_KEY)" == "$public" && "$(kv_get "$env" VAPID_PRIVATE_KEY)" == "$private" ]]; then ok 'a re-run keeps the pair'; else bad 'the pair changed on a re-run'; fi

kv_unset "$env" VAPID_PUBLIC_KEY
push_site_env "$env" >/dev/null 2>&1
if [[ -n "$(kv_get "$env" VAPID_PUBLIC_KEY)" && "$(kv_get "$env" VAPID_PRIVATE_KEY)" != "$private" ]]; then ok 'a half pair is made again whole'; else bad 'half pair'; fi

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
