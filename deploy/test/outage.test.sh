#!/bin/bash
# ============================================================
# File:        outage.test.sh
# Path:        deploy/test/outage.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the installer's outage e-mails (deploy/install/lib/outage.sh;
#              docs/DEPLOYMENT.md, "An e-mail when the site is down"): the answers (server,
#              port, user and a file holding the password) go into the mail account file, mode
#              600, the password never printed; a later run and --update keep the file without
#              asking; no server: no file; --outage-mail asks again; the watchdog's settings
#              file (no password in it) and its timer are installed and enabled, with this
#              checkout's paths. systemctl is a stand-in that notes its calls. Plain checks, no
#              framework; no root needed. Run: bash deploy/test/outage.test.sh; CI runs it. Exit
#              code 1 on any failure.
# ============================================================

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$ROOT/deploy/install/lib"
# shellcheck source=SCRIPTDIR/../install/lib/common.sh
source "$LIB/common.sh"
# shellcheck source=SCRIPTDIR/../install/lib/config.sh
source "$LIB/config.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
OUTAGE_SMTP_FILE="$work/etc/outage-smtp"
WATCHDOG_ENV_FILE="$work/etc/watchdog.env"
SYSTEMD_DIR="$work/systemd"
mkdir -p "$SYSTEMD_DIR"
# shellcheck source=SCRIPTDIR/../install/lib/outage.sh
source "$LIB/outage.sh"

failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }
systemctl() { echo "systemctl $*" >>"$work/systemctl.log"; }

UNATTENDED=yes
INSTALL_DIR="$ROOT"
SITE_DIR_REL=deploy/site
SITE_DOMAIN=se.test
password='abcd efgh ijkl mnop'
printf '%s\n' "$password" >"$work/password"

# A first run with the answers of an answers file.
OUTAGE_SMTP_HOST=smtp.gmail.com OUTAGE_SMTP_PORT=587 OUTAGE_SMTP_USER=alerts@example.org
OUTAGE_SMTP_PASSWORD_FILE="$work/password" OUTAGE_MAIL=''
ask_outage_mail
out="$(write_outage_smtp 2>&1)"
if [[ "$(kv_get "$OUTAGE_SMTP_FILE" SMTP_HOST)" == smtp.gmail.com && "$(kv_get "$OUTAGE_SMTP_FILE" SMTP_PORT)" == 587 &&
  "$(kv_get "$OUTAGE_SMTP_FILE" SMTP_USER)" == alerts@example.org && "$(kv_get "$OUTAGE_SMTP_FILE" SMTP_PASSWORD)" == "$password" ]]; then
  ok 'the answers go into the mail account file'
else
  bad 'the account file is not as answered'
fi
if [[ "$OUTAGE_MAIL" == set ]]; then ok 'remembered as set up'; else bad "OUTAGE_MAIL=$OUTAGE_MAIL"; fi
# Git Bash on Windows shows no Unix modes; Linux (CI) does.
if [[ "$(uname -s)" == MINGW* || "$(stat -c %a "$OUTAGE_SMTP_FILE")" == 600 ]]; then ok 'the file is mode 600'; else bad "mode $(stat -c %a "$OUTAGE_SMTP_FILE")"; fi
if [[ "$out" != *"$password"* && "$out" == *'never shown'* ]]; then ok 'the password is not printed'; else bad 'the password was printed'; fi

# A later run (and --update, which runs the installer again): kept, nothing asked.
cp "$OUTAGE_SMTP_FILE" "$work/before"
unset OUTAGE_SMTP_HOST OUTAGE_SMTP_PORT OUTAGE_SMTP_USER OUTAGE_SMTP_PASSWORD_FILE OUTAGE_SMTP_PASSWORD
ask() { bad "asked: $2"; }
ask_optional() { bad "asked: $2"; }
ask_outage_mail
write_outage_smtp >/dev/null 2>&1
if cmp -s "$OUTAGE_SMTP_FILE" "$work/before"; then ok 'a later run keeps the file without asking'; else bad 'the file changed on a later run'; fi
# shellcheck source=SCRIPTDIR/../install/lib/common.sh
source "$LIB/common.sh"

# --outage-mail asks again; an empty server answer writes nothing.
ASK_OUTAGE_MAIL=yes
rm -f "$OUTAGE_SMTP_FILE"
OUTAGE_SMTP_HOST=''
asked=''
ask_optional() { asked="$1"; printf -v "$1" '%s' ''; }
ask_outage_mail
write_outage_smtp >/dev/null 2>&1
if [[ "$asked" == OUTAGE_SMTP_HOST && ! -e "$OUTAGE_SMTP_FILE" ]]; then ok '--outage-mail asks again; no server: no file'; else bad "asked=$asked"; fi
ASK_OUTAGE_MAIL=no

# The watchdog: its settings (no secret) and its timer, with this checkout's paths.
CALLS_DOMAIN=calls.se.test
printf 'SMTP_PASSWORD=%s\n' "$password" >"$OUTAGE_SMTP_FILE"
out="$(install_watchdog /var/lib/docker/volumes/seasonal-site_site-data/_data 2>&1)"
envs="$(cat "$WATCHDOG_ENV_FILE")"
if [[ "$envs" == *'WATCH_SITE_URL=https://se.test/api/health'* && "$envs" == *'WATCH_CALLS_URL=https://calls.se.test/'* &&
  "$envs" == *'WATCH_RESOLVE=se.test:443:127.0.0.1 calls.se.test:443:127.0.0.1'* &&
  "$envs" == *'WATCH_ALERT_DIR=/var/lib/docker/volumes/seasonal-site_site-data/_data'* &&
  "$envs" == *"WATCH_SMTP_FILE=$OUTAGE_SMTP_FILE"* ]]; then
  ok 'the watchdog settings name the site, the call service, the data folder and the account file'
else
  bad "watchdog.env: $envs"
fi
if [[ "$envs" != *"$password"* && "$out" != *"$password"* ]]; then ok 'no password in its settings or the output'; else bad 'a password in the settings'; fi
service="$(cat "$SYSTEMD_DIR/seasonal-watchdog.service" 2>/dev/null)"
if [[ "$service" == *"ExecStart=$ROOT/deploy/site/watchdog/seasonal-watchdog.sh"* &&
  "$service" == *"EnvironmentFile=$WATCHDOG_ENV_FILE"* ]] &&
  ! grep -Eq '^(Requires|After|BindsTo)=.*docker' <<<"$service"; then
  ok 'the service runs this checkout'"'"'s watchdog with its settings, without Docker'
else
  bad "service: $service"
fi
if grep -q '^OnUnitActiveSec=2min$' "$SYSTEMD_DIR/seasonal-watchdog.timer" 2>/dev/null &&
  grep -q 'enable --now seasonal-watchdog.timer' "$work/systemctl.log"; then
  ok 'the timer is installed (every 2 minutes) and enabled'
else
  bad 'timer not installed or not enabled'
fi
CALLS_DOMAIN=''
install_watchdog /data >/dev/null 2>&1
if grep -q '^WATCH_CALLS_URL=$' "$WATCHDOG_ENV_FILE" && grep -q '^WATCH_RESOLVE=se.test:443:127.0.0.1$' "$WATCHDOG_ENV_FILE"; then
  ok 'without calls the call service is not checked'
else
  bad 'calls checked without calls'
fi

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
