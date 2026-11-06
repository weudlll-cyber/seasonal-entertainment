#!/bin/bash
# ============================================================
# File:        server-hardening.test.sh
# Path:        deploy/test/server-hardening.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the installer's hardening of 2026-11-04 (docs/DEPLOYMENT.md): the event
#              bot's admin page answers with the site's nosniff, referrer and framing headers
#              (each once, always, no script or style policy, and every add_header of the site's
#              server block repeated there); the Discord callback and file links are logged
#              without their query, nothing else's logging changed; LiveKit's signalling port
#              listens on 127.0.0.1 (every address only in Caddy mode); the installer refuses a
#              checkout that anyone but root could change; the backup folder is 750, its writer
#              uid 1000, its group the PC's read-only backup user when there is one; the recordings
#              folder is 2775, owner 1000, group 0, and a link in its place is refused. Generated
#              files and folder rules are checked as text, with stat, id and install pretended,
#              so no root is needed; as root, both folders' rules are also tried for real
#              (backups: uid 1000 writes and reads, another uid cannot list; recordings: the egress
#              user, uid 1001 group 0, writes, the site's uid 1000 reads and deletes, another uid
#              cannot write). Plain checks, no framework.
#              Run: bash deploy/test/server-hardening.test.sh; CI runs it. Exit code 1 on any
#              failure.
# ============================================================

# Generated nginx and compose lines hold $ literally, between single quotes on purpose.
# shellcheck disable=SC2016

set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../install/lib" && pwd)"
REPO="$(cd "$LIB/../../.." && pwd)"
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
# shellcheck source=SCRIPTDIR/../install/lib/services.sh
source "$LIB/services.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }
has_ipv6() { return 1; }

# --- The site's nginx server, with the bot's admin page ---
MODE=nginx SITE_DOMAIN=example.org BOT_ADMIN_URL=http://127.0.0.1:8090 WWW_REDIRECT=no
CALLS_DOMAIN=calls.example.org ACME_EMAIL=ops@example.org
conf="$(nginx_site_conf yes)"
# A location's lines, from its opening line to its closing brace.
block() { awk -v start="$1" 'index($0, start) == 1 { on = 1 } on { print } on && /^    }$/ { exit }' <<<"$conf"; }
bot="$(block '    location /bot-admin/ {')"

for header in 'X-Content-Type-Options nosniff' 'Referrer-Policy same-origin' \
  'X-Frame-Options SAMEORIGIN' "Content-Security-Policy \"frame-ancestors 'self'\""; do
  if [[ "$(grep -cF "add_header $header always;" <<<"$bot")" == 1 ]]; then ok "bot admin page: $header"; else bad "bot admin page lacks: $header"; fi
  if grep -qF "proxy_hide_header ${header%% *};" <<<"$bot"; then ok "the bot's own ${header%% *} hidden"; else bad "the bot's ${header%% *} not hidden"; fi
done
if grep -qE 'script-src|style-src|default-src' <<<"$bot"; then bad 'a script or style policy on the bot page'; else ok 'no script or style policy on the bot page'; fi
# Every add_header of the server block itself (outside any location) is repeated in the bot's.
server_headers="$(awk '/^    location / { in_loc = 1 } in_loc && /^    }$/ { in_loc = 0; next } !in_loc && /add_header/' <<<"$conf")"
missing=0
while read -r line; do
  [[ -z "$line" ]] || grep -qF "$line" <<<"$bot" || missing=1
done <<<"$server_headers"
if [[ "$missing" == 0 ]]; then ok "the server block's headers are in the bot's location too"; else bad 'a server header is missing in the bot location'; fi

# --- Logs without the query for the two secret-carrying paths, nothing else changed ---
if grep -q "^log_format seasonal_no_query .*\$request_method \$uri \$server_protocol" <<<"$conf" &&
  ! grep -q '^log_format seasonal_no_query .*\$request ' <<<"$conf"; then ok 'the log format leaves out the query'; else bad 'log format'; fi
for start in '    location = /api/auth/discord/callback {' '    location /api/chat/files/ {'; do
  if block "$start" | grep -q 'access_log /var/log/nginx/access.log seasonal_no_query;'; then ok "logged without query: $start"; else bad "not logged without query: $start"; fi
done
if [[ "$(grep -c 'access_log' <<<"$conf")" == 2 ]]; then ok 'no other access_log changed'; else bad "access_log lines: $(grep -c access_log <<<"$conf")"; fi
if ! nginx_calls_conf yes | grep -q access_log; then ok 'the calls server logs as before'; else bad 'calls server logging changed'; fi

# --- LiveKit's signalling port ---
compose="$REPO/deploy/calls/docker-compose.yml"
if grep -qF 'command: --config /etc/livekit.yaml --bind ${LIVEKIT_BIND:-127.0.0.1}' "$compose"; then ok 'LiveKit binds 7880 to LIVEKIT_BIND, 127.0.0.1 by default'; else bad 'LiveKit command'; fi
calls_env() { echo "$work/calls.env"; }
site_env() { echo "$work/site.env"; }
for case in nginx:127.0.0.1 caddy:0.0.0.0; do
  rm -f "$work/calls.env"
  MODE="${case%%:*}" write_calls_env >/dev/null
  if [[ "$(kv_get "$work/calls.env" LIVEKIT_BIND)" == "${case#*:}" ]]; then ok "LIVEKIT_BIND in ${case%%:*} mode: ${case#*:}"; else bad "LIVEKIT_BIND in ${case%%:*} mode"; fi
done
MODE=nginx

# --- A checkout anyone but root could change ---
# stat pretended: "<uid> <mode>" per folder from $work/folders ("path uid mode" lines).
stat() { awk -v p="${*: -1}" '$1 == p { print $2, $3 }' "$work/folders"; }
folders() { printf '%s\n' "$@" >"$work/folders"; }
folders '/opt/se 0 755' '/opt 0 755' '/ 0 755'
if ! unsafe_folder /opt/se >/dev/null; then ok 'a root-owned checkout passes'; else bad 'root-owned refused'; fi
folders '/opt/se 0 755' '/opt 0 775' '/ 0 755'
if [[ "$(unsafe_folder /opt/se)" == '/opt (owner uid 0, mode 775)' ]]; then ok 'a group-writable parent is named'; else bad "group-writable: $(unsafe_folder /opt/se)"; fi
folders '/home/u/se 1000 755' '/home/u 1000 755' '/home 0 755' '/ 0 755'
if [[ "$(unsafe_folder /home/u/se)" == '/home/u/se (owner uid 1000, mode 755)' ]]; then ok "another user's checkout is named"; else bad 'non-root owner'; fi
folders '/tmp/se 0 755' '/tmp 0 1777' '/ 0 755'
if unsafe_folder /tmp/se >/dev/null; then ok 'under /tmp (others may write) is refused'; else bad '/tmp passed'; fi
unset -f stat
# For real: this test's own folder lies under the temporary folder, which others may write.
out="$(refuse_unsafe_checkout "$work" 2>&1)"
if [[ $? -ne 0 && "$out" == *"STOPPED: the checkout"*"could be changed by someone else"*"nothing was changed"* ]]; then ok 'the installer stops, saying why and how'; else bad "refusal: $out"; fi

# --- The backup folder ---
BACKUP_HOST_DIR="$work/backups"
install() { echo "install $*" >>"$work/install"; }
for reader in yes no; do
  : >"$work/install"
  if [[ "$reader" == yes ]]; then id() { [[ "$1" == -g ]] && echo 990; return 0; }; else id() { return 1; }; fi
  prepare_backup_dir
  want="install -d -m 750 -o 1000 -g $([[ "$reader" == yes ]] && echo 990 || echo 0) $BACKUP_HOST_DIR"
  if [[ "$(cat "$work/install")" == "$want" ]]; then ok "backup folder 750, reader $reader"; else bad "backup folder: $(cat "$work/install")"; fi
done
unset -f install id

# As root: the rules for real, on a folder that was 755 (a re-run fixes it).
if [[ "$EUID" == 0 ]] && command -v setpriv >/dev/null; then
  mkdir -p "$BACKUP_HOST_DIR" && chmod 755 "$BACKUP_HOST_DIR"
  id() { return 1; }
  prepare_backup_dir
  unset -f id
  if [[ "$(command stat -c '%a %u' "$BACKUP_HOST_DIR")" == '750 1000' ]]; then ok 'a re-run makes an old folder 750'; else bad "real folder: $(command stat -c '%a %u' "$BACKUP_HOST_DIR")"; fi
  chmod 755 "$work"
  if setpriv --reuid 1000 --regid 1000 --clear-groups sh -c "echo backup >'$BACKUP_HOST_DIR/b.tar.age' && cat '$BACKUP_HOST_DIR/b.tar.age'" >/dev/null; then ok 'the site (uid 1000) writes and reads its backups (backup and restore)'; else bad 'uid 1000 cannot use the folder'; fi
  if ! setpriv --reuid 1001 --regid 1001 --clear-groups ls "$BACKUP_HOST_DIR" >/dev/null 2>&1; then ok 'another account cannot even list it'; else bad 'another account lists the backups'; fi
else
  echo "skip the backup folder for real (needs root and setpriv)"
fi

# --- The recordings folder ---
REC_DIR="$work/recordings"
install() { echo "install $*" >>"$work/install"; }
: >"$work/install"
prepare_recordings_dir "$REC_DIR"
if [[ "$(cat "$work/install")" == "install -d -m 2775 -o 1000 -g 0 $REC_DIR" ]]; then ok 'recordings folder 2775, owner 1000, group 0'; else bad "recordings folder: $(cat "$work/install")"; fi
unset -f install
ln -s "$work" "$work/rec-link"
out="$( (prepare_recordings_dir "$work/rec-link") 2>&1)"
if [[ "$out" == *"is a link, not the recordings folder"* ]]; then ok 'a link in its place is refused, nothing changed'; else bad "link: $out"; fi

# As root: the rules for real, on a folder made 755 1000:1000 as before 2026-11-06.
if [[ "$EUID" == 0 ]] && command -v setpriv >/dev/null; then
  mkdir -p "$REC_DIR" && chown 1000:1000 "$REC_DIR" && chmod 755 "$REC_DIR"
  prepare_recordings_dir "$REC_DIR"
  if [[ "$(command stat -c '%a %u %g' "$REC_DIR")" == '2775 1000 0' ]]; then ok 'a re-run fixes an old folder: 2775 1000:0'; else bad "real recordings folder: $(command stat -c '%a %u %g' "$REC_DIR")"; fi
  chmod 755 "$work"
  # The egress image's user: uid 1001, primary group 0, umask 022.
  if setpriv --reuid 1001 --regid 0 --clear-groups sh -c "umask 022 && echo mp4 >'$REC_DIR/call.mp4'"; then ok 'the egress (uid 1001, group 0) writes a recording'; else bad 'the egress cannot write'; fi
  if setpriv --reuid 1000 --regid 1000 --clear-groups sh -c "cat '$REC_DIR/call.mp4' >/dev/null && rm '$REC_DIR/call.mp4'"; then ok 'the site (uid 1000) reads and deletes it'; else bad 'the site cannot read or delete'; fi
  if ! setpriv --reuid 1002 --regid 1002 --clear-groups sh -c "echo x >'$REC_DIR/other'" 2>/dev/null; then ok 'another account cannot write there'; else bad 'another account writes recordings'; fi
else
  echo "skip the recordings folder for real (needs root and setpriv)"
fi

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
