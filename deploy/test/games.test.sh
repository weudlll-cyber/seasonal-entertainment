#!/bin/bash
# ============================================================
# File:        games.test.sh
# Path:        deploy/test/games.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the installer's part for the embedded games (deploy/install/lib/games.sh;
#              docs/DEPLOYMENT.md, "Embedded games"): one question per game (Bingo, Mini Games),
#              asked once on a terminal, again only with its flag, never unattended, read from an
#              answers file; the site's nginx server block includes /etc/seasonal/routes/*.conf
#              exactly once and denies every game's account feed, the calls server neither; the
#              routes folder (root, 755) and the port file are made; with any game on the sync
#              token is made once (root only, 64 hex characters, kept on the next run, never
#              printed) and site.env carries the list and the token, with none neither; a
#              Bingo-only install comes out of an unattended --update with Bingo on and Mini Games
#              off. With Docker (always in CI): the real nginx -t and nginx denying both feeds
#              while a game's route file answers, and the site's own Caddy answering both feeds
#              404. Paths point into a folder of the test and install's owners are recorded, so no
#              root is needed. Plain checks, no framework. Run: bash deploy/test/games.test.sh;
#              CI runs it. Exit code 1 on any failure.
# ============================================================

set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../install/lib" && pwd)"
DEPLOY="$(cd "$LIB/../.." && pwd)"
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
# shellcheck source=SCRIPTDIR/../install/lib/games.sh
source "$LIB/games.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }
has_ipv6() { return 1; }

# Everything into the test's folder; owners recorded, not set.
STATE_DIR="$work/etc-seasonal"
STATE_FILE="$STATE_DIR/install.conf"
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

BINGO_Q='Will Seasonal Bingo Royale be embedded at /games/bingo? (yes/no)'
MINI_Q='Will Seasonal Mini Games be embedded at /games/mini-games? (yes/no)'

# --- the questions: a terminal played (have_tty yes; ask notes the question, gives the reply) ---
declare -A REPLY_FOR=()
asked=()
have_tty() { return 0; }
ask() { asked+=("$2"); printf -v "$1" '%s' "${REPLY_FOR[$1]:-$3}"; }
asked_now() { local IFS='|'; printf '%s' "${asked[*]}"; }
run_ask() { asked=(); ask_games; }

UNATTENDED=no ASK_BINGO=no ASK_MINI_GAMES=no BINGO="" MINI_GAMES=""
REPLY_FOR=([BINGO]=no [MINI_GAMES]=yes)
run_ask
if [[ "$(asked_now)" == "$BINGO_Q|$MINI_Q" && "$BINGO" == no && "$MINI_GAMES" == yes ]]; then ok 'first run on a terminal: both questions, the answers taken'; else bad "first run: $(asked_now) / $BINGO $MINI_GAMES"; fi
run_ask
if [[ -z "$(asked_now)" && "$BINGO" == no && "$MINI_GAMES" == yes ]]; then ok 'answered: not asked again'; else bad "re-run asked: $(asked_now)"; fi
ASK_MINI_GAMES=yes REPLY_FOR=([MINI_GAMES]=no)
run_ask
ASK_MINI_GAMES=no
if [[ "$(asked_now)" == "$MINI_Q" && "$MINI_GAMES" == no && "$BINGO" == no ]]; then ok '--mini-games asks that question again, only it'; else bad "--mini-games: $(asked_now)"; fi
ASK_BINGO=yes REPLY_FOR=([BINGO]=yes)
run_ask
# shellcheck disable=SC2034 # ask_games reads ASK_<key> by name
ASK_BINGO=no
if [[ "$(asked_now)" == "$BINGO_Q" && "$BINGO" == yes && "$MINI_GAMES" == no ]]; then ok '--bingo asks that question again, only it'; else bad "--bingo: $(asked_now)"; fi
answer_keys="$(sed -n '/^ANSWER_KEYS="/,/"$/p' "$DEPLOY/install.sh")"
if [[ " $answer_keys " =~ [[:space:]\"]BINGO[[:space:]\"] && "$answer_keys" =~ [[:space:]]MINI_GAMES\" && " $STATE_KEYS " == *" MINI_GAMES "* && " $STATE_KEYS " == *" BINGO "* ]]; then ok 'both answers read from an answers file and remembered'; else bad 'answer or state keys'; fi
BINGO=yes MINI_GAMES=no
run_ask
if [[ -z "$(asked_now)" && "$BINGO" == yes && "$MINI_GAMES" == no ]]; then ok 'answers given (file or state): not asked'; else bad "given answers asked: $(asked_now)"; fi
UNATTENDED=yes BINGO=yes MINI_GAMES=""
run_ask
if [[ -z "$(asked_now)" && "$BINGO" == yes && "$MINI_GAMES" == no ]]; then ok 'unattended: nothing asked, the remembered kept, the missing no'; else bad "unattended: $(asked_now) / $BINGO $MINI_GAMES"; fi
UNATTENDED=no
# shellcheck disable=SC2034 # ask_games reads ASK_<key> by name
out="$( (have_tty() { return 1; }; ASK_MINI_GAMES=yes; ask_games) 2>&1)"
if [[ "$out" == *'--mini-games needs a terminal'* ]]; then ok '--mini-games without a terminal stops'; else bad "no terminal: $out"; fi
out="$( (MINI_GAMES=maybe; ask_games) 2>&1)"
if [[ "$out" == *'MINI_GAMES is yes or no'* ]]; then ok 'an answer other than yes or no stops'; else bad "bad answer: $out"; fi

# --- nginx: the include and every game's feed denied, in the site's server block only ---
MODE=nginx SITE_DOMAIN=example.org CALLS_DOMAIN=calls.example.org WWW_REDIRECT=yes BOT_ADMIN_URL=none
site="$(nginx_site_conf yes)"
main="$(awk '/server_name example.org;/ { on = 1 } on { print } on && /^}$/ { exit }' <<<"$site")"
if [[ "$(grep -c "include $ROUTES_DIR/\*.conf;" <<<"$site")" == 1 ]] && grep -q "include $ROUTES_DIR/\*.conf;" <<<"$main"; then ok 'the site server block includes the routes folder, once'; else bad 'routes include'; fi
for slug in bingo mini-games; do
  if grep -A2 "location ^~ /api/games/$slug/account-changes {" <<<"$main" | grep -q 'deny all;'; then ok "the $slug feed is denied through nginx"; else bad "$slug feed not denied"; fi
done
if ! nginx_calls_conf yes | grep -q 'routes\|account-changes'; then ok 'the calls server has neither'; else bad 'calls server changed'; fi
if ! nginx_site_conf no | grep -q 'routes'; then ok 'port 80 alone (before a certificate) has no include'; else bad 'port 80 include'; fi

# --- the routes folder and the port file ---
SITE_LOCAL_PORT=3800
games_before_nginx
if [[ -d "$ROUTES_DIR" && "$(stat -c %a "$ROUTES_DIR")" == 755 ]] && grep -q "install -o root $ROUTES_DIR" "$work/owners"; then ok 'the routes folder: root, 755'; else bad "routes folder: $(stat -c %a "$ROUTES_DIR" 2>&1)"; fi
if [[ "$(cat "$SITE_PORT_FILE")" == 3800 && "$(stat -c %a "$SITE_PORT_FILE")" == 644 ]]; then ok 'the port file says 3800'; else bad 'port file'; fi
echo 'proxy secret' >"$ROUTES_DIR/mini-games.conf"
games_before_nginx
if [[ "$(cat "$ROUTES_DIR/mini-games.conf")" == 'proxy secret' ]]; then ok "a re-run leaves a game's file alone"; else bad 'route file touched'; fi

# --- site.env and the token ---
env="$work/site.env"
BINGO=yes MINI_GAMES=yes
out="$(games_site_env "$env" 2>&1)"
token="$(cat "$GAMES_SYNC_TOKEN_FILE")"
if [[ "$token" =~ ^[0-9a-f]{64}$ && "$(stat -c %a "$GAMES_SYNC_TOKEN_FILE")" == 600 ]]; then ok 'the token: 64 hex characters, mode 600'; else bad 'token file'; fi
if [[ "$out" != *"$token"* && "$out" == *"never shown"* ]]; then ok 'the token is never printed'; else bad 'token printed'; fi
if [[ "$(kv_get "$env" GAMES_EMBEDDED)" == bingo,mini-games && "$(kv_get "$env" GAMES_SYNC_TOKEN)" == "$token" ]]; then ok 'site.env: both games and the token'; else bad 'site.env with both'; fi
BINGO=no
games_site_env "$env" >/dev/null 2>&1
if [[ "$(kv_get "$env" GAMES_EMBEDDED)" == mini-games && "$(cat "$GAMES_SYNC_TOKEN_FILE")" == "$token" ]]; then ok 'Mini Games alone; a re-run keeps the token'; else bad 'mini-games alone'; fi
MINI_GAMES=no
games_site_env "$env"
if [[ -z "$(kv_get "$env" GAMES_EMBEDDED)" && -z "$(kv_get "$env" GAMES_SYNC_TOKEN)" ]]; then ok 'none: neither in site.env'; else bad 'site.env with none'; fi

# --- an install from before the list: Bingo only, then an unattended --update ---
printf 'MODE=nginx\nBINGO=yes\n' >"$STATE_FILE"
printf 'GAMES_BINGO_EMBEDDED=1\nGAMES_SYNC_TOKEN=%s\n' "$token" >"$env"
BINGO="" MINI_GAMES="" UNATTENDED=yes
load_state
run_ask
games_site_env "$env" >/dev/null 2>&1
save_state
if [[ -z "$(asked_now)" && "$BINGO" == yes && "$MINI_GAMES" == no ]]; then ok 'Bingo-only install, unattended: nothing asked, Bingo on, Mini Games off'; else bad "bingo-only: $(asked_now) / $BINGO $MINI_GAMES"; fi
if [[ "$(kv_get "$env" GAMES_EMBEDDED)" == bingo && "$(kv_get "$env" GAMES_SYNC_TOKEN)" == "$token" && -z "$(kv_get "$env" GAMES_BINGO_EMBEDDED)" ]]; then ok 'its site.env: the list says bingo, the same token, the old switch gone'; else bad "bingo-only site.env: $(cat "$env")"; fi
if [[ "$(kv_get "$STATE_FILE" BINGO)" == yes && "$(kv_get "$STATE_FILE" MINI_GAMES)" == no ]]; then ok 'its state: BINGO=yes, MINI_GAMES=no remembered'; else bad 'bingo-only state'; fi

# --- the real nginx and Caddy, in Docker (always in CI; a PC without Docker skips them) ---
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  # Docker on Windows (Git Bash) takes Windows paths for its volumes; elsewhere they are as is.
  host_path() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
  # The answer's status of each path, as "path status", from BASE (nginx: 127.0.0.1, as it
  # listens on IPv4 only; Caddy: the site's name).
  # shellcheck disable=SC2016 # expanded inside the container
  probe='for p in $PATHS; do printf "%s %s\n" "$p" "$(wget -q -S -O /dev/null "$BASE$p" 2>&1 | sed -n "s/^ *HTTP\/1.1 \([0-9]*\).*/\1/p" | tail -1)"; done'
  paths='/api/games/bingo/account-changes?since=0 /api/games/mini-games/account-changes /api/games/mini-games/authorize /games/mini-games/'

  # nginx: the site's routes lines in a server block, a game's route file in the folder.
  conf="$work/nginx"
  mkdir -p "$conf/routes"
  printf 'location ^~ /games/mini-games/ { return 204; }\n' >"$conf/routes/mini-games.conf"
  {
    echo 'error_log stderr crit;'
    echo 'events {}'
    echo 'http {'
    echo '  access_log off;'
    echo '  server {'
    echo '    listen 8080;'
    ROUTES_DIR=/etc/seasonal/routes nginx_routes_lines
    echo '    location / { return 200; }'
    echo '  }'
    echo '}'
  } >"$conf/nginx.conf"
  got="$(MSYS_NO_PATHCONV=1 docker run --rm -e PATHS="$paths" -e BASE=http://127.0.0.1:8080 \
    -v "$(host_path "$conf/nginx.conf"):/etc/nginx/nginx.conf:ro" \
    -v "$(host_path "$conf/routes"):/etc/seasonal/routes:ro" nginx:1.27.5-alpine \
    sh -c "nginx -t 2>&1 | tail -1 && nginx && $probe")"
  want="nginx: configuration file /etc/nginx/nginx.conf test is successful
/api/games/bingo/account-changes?since=0 403
/api/games/mini-games/account-changes 403
/api/games/mini-games/authorize 200
/games/mini-games/ 204"
  if [[ "$got" == "$want" ]]; then ok 'nginx -t passes; nginx denies both feeds, the rest and a game route answer'; else bad "nginx: $got"; fi

  # The site's own Caddy (its pinned image): both feeds 404, the rest goes to the site (absent
  # here: 502).
  image="$(sed -n 's/^ *image: \(caddy:[^ ]*\).*/\1/p' "$DEPLOY/site/docker-compose.yml" | head -1)"
  got="$(MSYS_NO_PATHCONV=1 docker run --rm -e PATHS="$paths" -e BASE=http://localhost:8080 \
    -e SITE_DOMAIN=http://localhost:8080 -e ACME_EMAIL=ops@site.example -v "$(host_path "$DEPLOY/site/Caddyfile"):/etc/caddy/Caddyfile:ro" \
    "$image" sh -c "caddy start --config /etc/caddy/Caddyfile >/dev/null 2>&1 && sleep 1 && $probe")"
  want="/api/games/bingo/account-changes?since=0 404
/api/games/mini-games/account-changes 404
/api/games/mini-games/authorize 502
/games/mini-games/ 502"
  if [[ "$got" == "$want" ]]; then ok "the site's Caddy answers both feeds 404"; else bad "caddy: $got"; fi
elif [[ -n "${CI:-}" ]]; then
  bad 'Docker is needed in CI for the nginx and Caddy checks'
else
  echo 'skip the real nginx and Caddy (no Docker here)'
fi

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
