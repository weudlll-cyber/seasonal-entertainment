#!/bin/bash
# ============================================================
# File:        discord.test.sh
# Path:        deploy/test/discord.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of how the installer takes the Discord login's settings (deploy/install/lib/
#              discord.sh; docs/DEPLOYMENT.md, "Discord login"): from the answers file with a
#              secret file (its first line, CRLF and spaces at the ends dropped) into site.env;
#              asked on a terminal once (not again after an empty answer, again with --discord);
#              ids that are no Discord ids and a secret with spaces refused, never showing the
#              secret; a missing secret file named; a remembered "none" not asked again; --discord
#              answered with Enter removing the settings; nothing printed ever contains the
#              secret. Plain checks, no framework; no root needed. Run: bash
#              deploy/test/discord.test.sh; CI runs it. Exit code 1 on any failure.
# ============================================================

set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../install/lib" && pwd)"
# shellcheck source=SCRIPTDIR/../install/lib/common.sh
source "$LIB/common.sh"
# shellcheck source=SCRIPTDIR/../install/lib/discord.sh
source "$LIB/discord.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }

SECRET='s3cr3t-Discord-Client-Value_42'
CLIENT=1566923848543117513
site_env() { printf '%s' "$work/site.env"; }

# A fresh run: no terminal, the given variables set; prints everything it said (stdout and
# stderr) into $work/out. run NAME=value...
run() {
  : >"$work/out"
  (
    unset DISCORD_CLIENT_ID DISCORD_GUILD_ID DISCORD_CLIENT_SECRET DISCORD_CLIENT_SECRET_FILE DISCORD
    ASK_DISCORD=no UNATTENDED=yes
    for assignment in "$@"; do export "${assignment?}"; done
    ask_discord && discord_site_env "$(site_env)" && echo "state DISCORD=${DISCORD:-}"
  ) >"$work/out" 2>&1
}
never_shown() {
  if grep -q "$SECRET" "$work/out"; then bad "$1: the secret was shown"; else ok "$1: the secret not shown"; fi
}

# From the answers file, the secret from a file with CRLF and spaces around it.
printf '  %s  \r\nsecond line\r\n' "$SECRET" >"$work/secret"
: >"$work/site.env"
run DISCORD_CLIENT_ID="$CLIENT" DISCORD_CLIENT_SECRET_FILE="$work/secret"
if [[ "$(kv_get "$work/site.env" DISCORD_CLIENT_SECRET)" == "$SECRET" ]]; then ok 'the secret from the file, trimmed'; else bad "secret in site.env: $(cat "$work/out")"; fi
if [[ "$(kv_get "$work/site.env" DISCORD_GUILD_ID)" == "$DISCORD_DEFAULT_GUILD" ]]; then ok 'the Seasonal Tokens server by default'; else bad 'guild id'; fi
if [[ "$(kv_get "$work/site.env" DISCORD_CLIENT_ID)" == "$CLIENT" ]]; then ok 'the client id'; else bad 'client id'; fi
never_shown 'answers file'

# Refusals: what is wrong, never the secret.
run DISCORD_CLIENT_ID=12ab DISCORD_CLIENT_SECRET_FILE="$work/secret"
if grep -q 'DISCORD_CLIENT_ID is not a Discord id' "$work/out"; then ok 'a client id that is no Discord id refused'; else bad "client id refusal: $(cat "$work/out")"; fi
never_shown 'id refusal'
printf 'two words\n' >"$work/spaced"
run DISCORD_CLIENT_ID="$CLIENT" DISCORD_CLIENT_SECRET_FILE="$work/spaced"
if grep -q 'without spaces (it is not shown)' "$work/out" && ! grep -q 'two words' "$work/out"; then ok 'a secret with spaces refused, not shown'; else bad "spaced secret: $(cat "$work/out")"; fi
run DISCORD_CLIENT_ID="$CLIENT" DISCORD_CLIENT_SECRET_FILE="$work/missing"
if grep -q "cannot read the Discord secret file: $work/missing" "$work/out"; then ok 'a missing secret file named'; else bad "missing file: $(cat "$work/out")"; fi

# A remembered "none" on a plain run: nothing asked, nothing changed.
printf 'DISCORD_CLIENT_ID=%s\n' "$CLIENT" >"$work/site.env"
run DISCORD=none
if [[ "$(kv_get "$work/site.env" DISCORD_CLIENT_ID)" == "$CLIENT" ]] && grep -q 'state DISCORD=none' "$work/out"; then ok 'a remembered none keeps what site.env has'; else bad "none: $(cat "$work/out")"; fi

# On a terminal (pretended: the question only records that it came, and is answered empty):
# asked on a first run, not after a remembered none, again with --discord.
asked() {
  : >"$work/site.env"
  (
    unset DISCORD_CLIENT_ID DISCORD_GUILD_ID DISCORD_CLIENT_SECRET DISCORD_CLIENT_SECRET_FILE DISCORD
    UNATTENDED=no ASK_DISCORD=no
    for assignment in "$@"; do export "${assignment?}"; done
    have_tty() { true; }
    ask_optional() { echo ASKED; printf -v "$1" '%s' ''; }
    ask_discord
  ) 2>&1 | grep -q ASKED
}
if asked; then ok 'asked on a first run'; else bad 'not asked on a first run'; fi
if asked DISCORD=none; then bad 'asked again after a remembered none'; else ok 'not asked again after a remembered none'; fi
if asked DISCORD=none ASK_DISCORD=yes; then ok 'asked again with --discord'; else bad 'not asked with --discord'; fi

# --discord answered with Enter: the settings go.
printf 'DISCORD_CLIENT_ID=%s\nDISCORD_GUILD_ID=1\nDISCORD_CLIENT_SECRET=%s\nOTHER=x\n' "$CLIENT" "$SECRET" >"$work/site.env"
(
  ASK_DISCORD=yes DISCORD=none
  discord_site_env "$work/site.env"
) >"$work/out" 2>&1
if [[ -z "$(kv_get "$work/site.env" DISCORD_CLIENT_SECRET)" && -z "$(kv_get "$work/site.env" DISCORD_CLIENT_ID)" && "$(kv_get "$work/site.env" OTHER)" == x ]]; then
  ok '--discord with Enter removes the settings, nothing else'
else
  bad "--discord removal: $(cat "$work/site.env")"
fi
never_shown 'removal'

echo
if ((failures)); then
  echo "$failures failed"
  exit 1
fi
echo 'all passed'
