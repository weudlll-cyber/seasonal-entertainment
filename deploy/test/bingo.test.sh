#!/bin/bash
# ============================================================
# File:        bingo.test.sh
# Path:        deploy/test/bingo.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the installer's part for Seasonal Bingo Royale (deploy/install/lib/
#              bingo.sh; docs/DEPLOYMENT.md, "Seasonal Bingo Royale"): the site's nginx server
#              block includes /etc/seasonal/routes/*.conf exactly once and denies the games'
#              account feed, the calls server neither; the routes folder (root, 755) and the port
#              file are made; an unattended run never asks and means no; with yes the sync token
#              is made once (root only, 64 hex characters, kept on the next run, never printed)
#              and site.env carries the switch and the token, with no neither. Paths point into a
#              folder of the test and install's owners are recorded, so no root is needed.
#              Plain checks, no framework. Run: bash deploy/test/bingo.test.sh; CI runs it. Exit
#              code 1 on any failure.
# ============================================================

set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../install/lib" && pwd)"
# shellcheck source=SCRIPTDIR/../install/lib/common.sh
source "$LIB/common.sh"
# shellcheck source=SCRIPTDIR/../install/lib/config.sh
source "$LIB/config.sh"
# shellcheck source=SCRIPTDIR/../install/lib/nginx.sh
source "$LIB/nginx.sh"
# shellcheck source=SCRIPTDIR/../install/lib/nginx-default.sh
source "$LIB/nginx-default.sh"
# shellcheck source=SCRIPTDIR/../install/lib/bot-admin.sh
source "$LIB/bot-admin.sh"
# shellcheck source=SCRIPTDIR/../install/lib/bingo.sh
source "$LIB/bingo.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }
has_ipv6() { return 1; }

# Everything into the test's folder; owners recorded, not set.
STATE_DIR="$work/etc-seasonal"
ROUTES_DIR="$STATE_DIR/routes"
SITE_PORT_FILE="$STATE_DIR/site-local-port"
GAMES_SYNC_TOKEN_FILE="$STATE_DIR/games-sync-token"
chown() { echo "chown $*" >>"$work/owners"; }
install() {
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -o | -g) echo "install $1 $2 ${*: -1}" >>"$work/owners"; shift 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  command install "${args[@]}"
}

# --- nginx: the include and the denied feed, in the site's server block only ---
MODE=nginx SITE_DOMAIN=example.org CALLS_DOMAIN=calls.example.org WWW_REDIRECT=yes BOT_ADMIN_URL=none
site="$(nginx_site_conf yes)"
main="$(awk '/server_name example.org;/ { on = 1 } on { print } on && /^}$/ { exit }' <<<"$site")"
if [[ "$(grep -c "include $ROUTES_DIR/\*.conf;" <<<"$site")" == 1 ]] && grep -q "include $ROUTES_DIR/\*.conf;" <<<"$main"; then ok 'the site server block includes the routes folder, once'; else bad 'routes include'; fi
if grep -A2 'location ^~ /api/games/bingo/account-changes {' <<<"$main" | grep -q 'deny all;'; then ok 'the account feed is denied through nginx'; else bad 'feed not denied'; fi
if ! nginx_calls_conf yes | grep -q 'routes\|account-changes'; then ok 'the calls server has neither'; else bad 'calls server changed'; fi
if ! nginx_site_conf no | grep -q 'routes'; then ok 'port 80 alone (before a certificate) has no include'; else bad 'port 80 include'; fi

# --- the routes folder and the port file ---
SITE_LOCAL_PORT=3800
bingo_before_nginx
if [[ -d "$ROUTES_DIR" && "$(stat -c %a "$ROUTES_DIR")" == 755 ]] && grep -q "install -o root $ROUTES_DIR" "$work/owners"; then ok 'the routes folder: root, 755'; else bad "routes folder: $(stat -c %a "$ROUTES_DIR" 2>&1)"; fi
if [[ "$(cat "$SITE_PORT_FILE")" == 3800 && "$(stat -c %a "$SITE_PORT_FILE")" == 644 ]]; then ok 'the port file says 3800'; else bad 'port file'; fi
echo 'proxy secret' >"$ROUTES_DIR/bingo.conf"
bingo_before_nginx
if [[ "$(cat "$ROUTES_DIR/bingo.conf")" == 'proxy secret' ]]; then ok "a re-run leaves the game's file alone"; else bad 'route file touched'; fi

# --- the question and the token ---
UNATTENDED=yes
BINGO=""
ask_bingo
if [[ "$BINGO" == no ]]; then ok 'unattended: not asked, no'; else bad "unattended: $BINGO"; fi
env="$work/site.env"
BINGO=yes
out="$(bingo_site_env "$env" 2>&1)"
token="$(cat "$GAMES_SYNC_TOKEN_FILE")"
if [[ "$token" =~ ^[0-9a-f]{64}$ && "$(stat -c %a "$GAMES_SYNC_TOKEN_FILE")" == 600 ]]; then ok 'the token: 64 hex characters, mode 600'; else bad 'token file'; fi
if [[ "$out" != *"$token"* && "$out" == *"never shown"* ]]; then ok 'the token is never printed'; else bad 'token printed'; fi
if [[ "$(kv_get "$env" GAMES_BINGO_EMBEDDED)" == 1 && "$(kv_get "$env" GAMES_SYNC_TOKEN)" == "$token" ]]; then ok 'site.env: the switch and the token'; else bad 'site.env with yes'; fi
bingo_site_env "$env" >/dev/null 2>&1
if [[ "$(cat "$GAMES_SYNC_TOKEN_FILE")" == "$token" ]]; then ok 'a re-run keeps the token'; else bad 'token replaced'; fi
BINGO=no
bingo_site_env "$env"
if [[ -z "$(kv_get "$env" GAMES_BINGO_EMBEDDED)" && -z "$(kv_get "$env" GAMES_SYNC_TOKEN)" ]]; then ok 'no: neither in site.env'; else bad 'site.env with no'; fi

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
