#!/bin/bash
# ============================================================
# File:        watchdog.test.sh
# Path:        deploy/test/watchdog.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the outage watchdog (deploy/site/watchdog/seasonal-watchdog.sh;
#              docs/DEPLOYMENT.md, "An e-mail when the site is down") against a stand-in mail
#              server (fake-smtp.py): nothing while all answers; one failed check sends nothing,
#              the second one "down" e-mail, later ones none; one "back up" e-mail when both
#              answer again; the call service alone counts too; no address: nothing sent; a
#              mail server that fails is tried again on the next run; the admin page's test
#              e-mail goes out once per request with its outcome written back; the password
#              reaches the mail server and never the output. The checked addresses are file://
#              ones (a missing file is a failed check). Plain checks, no framework; needs curl
#              and Python 3. Run: bash deploy/test/watchdog.test.sh; CI runs it. Exit code 1 on
#              any failure.
# ============================================================

set -u

WATCHDOG="$(cd "$(dirname "${BASH_SOURCE[0]}")/../site/watchdog" && pwd)/seasonal-watchdog.sh"
FAKE_SMTP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fake-smtp.py"
PYTHON="$(command -v python3 || command -v python)"

work="$(mktemp -d)"
smtp_pid=''
cleanup() {
  [[ -z "$smtp_pid" ]] || kill "$smtp_pid" 2>/dev/null
  rm -rf "$work"
}
trap cleanup EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }

# A file:// address curl reads on Linux and in Git Bash on Windows.
file_url() { if command -v cygpath >/dev/null; then echo "file:///$(cygpath -m "$1")"; else echo "file://$1"; fi; }

mkdir -p "$work/alerts" "$work/state" "$work/mail" "$work/health"
site="$work/health/site.json"
calls="$work/health/calls.txt"
up() { echo '{"ok":true,"version":"9.9.9"}' >"$site" && echo OK >"$calls"; }
smtp_file="$work/outage-smtp"
password='app pass "with" \ quotes'

start_smtp() {
  rm -f "$work/mail/port"
  "$PYTHON" "$FAKE_SMTP" "$work/mail" &
  smtp_pid=$!
  for _ in $(seq 50); do [[ -s "$work/mail/port" ]] && break; sleep 0.1; done
  {
    echo 'SMTP_HOST=127.0.0.1'
    echo "SMTP_PORT=$(cat "$work/mail/port")"
    echo 'SMTP_USER=alerts@example.org'
    echo 'SMTP_FROM=alerts@example.org'
    echo 'SMTP_TLS=none'
    echo "SMTP_PASSWORD=$password"
  } >"$smtp_file"
}
stop_smtp() { kill "$smtp_pid" 2>/dev/null; wait "$smtp_pid" 2>/dev/null; smtp_pid=''; }

run() {
  WATCH_SITE_URL="$(file_url "$site")" WATCH_CALLS_URL="$(file_url "$calls")" \
    WATCH_ALERT_DIR="$work/alerts" WATCH_STATE_DIR="$work/state" WATCH_SMTP_FILE="$smtp_file" \
    WATCH_SITE_NAME=se.test WATCH_TIMEOUT=5 bash "$WATCHDOG" 2>&1 | tee -a "$work/output"
}
mails() { find "$work/mail" -name 'mail-*.eml' | wc -l | tr -d ' '; }
newest() { cat "$(find "$work/mail" -name 'mail-*.eml' | sort -t- -k2 -n | tail -n 1)"; }

start_smtp
echo 'admin@example.org' >"$work/alerts/outage-alert-address"
up

run >/dev/null
if [[ "$(mails)" == 0 ]]; then ok 'all answers: nothing sent'; else bad 'a mail while all answers'; fi

rm "$site"
run >/dev/null
if [[ "$(mails)" == 0 ]]; then ok 'one failed check sends nothing'; else bad 'a mail after one failure'; fi
run >/dev/null
if [[ "$(mails)" == 1 ]] && newest | grep -q '^Subject: Down: se.test' && newest | grep -q '^RCPT admin@example.org$' &&
  newest | grep -q 'the site did not answer 2 checks'; then
  ok 'the second failed check sends one "down" e-mail to the saved address'
else
  bad "down mail: $(mails) mails"
fi
run >/dev/null
run >/dev/null
if [[ "$(mails)" == 1 ]]; then ok 'no repeats while it stays down'; else bad "repeats: $(mails)"; fi

up
run >/dev/null
if [[ "$(mails)" == 2 ]] && newest | grep -q '^Subject: Back up: se.test'; then ok 'one "back up" e-mail when both answer'; else bad "back up: $(mails)"; fi
run >/dev/null
if [[ "$(mails)" == 2 ]]; then ok 'nothing more once it is up'; else bad 'a mail after back up'; fi

rm "$calls"
run >/dev/null
run >/dev/null
if [[ "$(mails)" == 3 ]] && newest | grep -q 'the call service did not answer'; then ok 'the call service alone counts too'; else bad 'calls down'; fi
up
run >/dev/null

if grep -qF "alerts@example.org $password" "$work/mail/auth.log"; then ok 'the password reaches the mail server'; else bad 'the login was not the account'"'"'s'; fi
if ! grep -qF 'with' "$work/output"; then ok 'the password is never printed'; else bad 'the password was printed'; fi

# No address: nothing is sent, and nothing is sent later either.
: >"$work/alerts/outage-alert-address"
before="$(mails)"
rm "$site"
run >/dev/null
run >/dev/null
up
run >/dev/null
if [[ "$(mails)" == "$before" ]]; then ok 'no address: nothing sent'; else bad 'mailed without an address'; fi

# The mail server fails: the down e-mail is tried again on the next run.
echo 'admin@example.org' >"$work/alerts/outage-alert-address"
stop_smtp
rm "$site"
run >/dev/null
out="$(run)"
if [[ "$out" == *'NOT sent'* ]]; then ok 'a failing mail server is reported'; else bad "no report: $out"; fi
start_smtp
before="$(mails)"
run >/dev/null
if [[ "$(mails)" == $((before + 1)) ]] && newest | grep -q '^Subject: Down'; then ok 'and the next run sends it'; else bad 'not tried again'; fi
up
run >/dev/null

# The admin page's test e-mail: once per request, its outcome written back for the site.
before="$(mails)"
echo '2026-11-14T20:00:00.000Z' >"$work/alerts/outage-test-request"
run >/dev/null
result="$(cat "$work/alerts/outage-test-result" 2>/dev/null)"
if [[ "$(mails)" == $((before + 1)) ]] && newest | grep -q '^Subject: Test: outage alerts of se.test' &&
  [[ "$result" == 'sent 2026-11-14T20:00:00.000Z '* ]]; then
  ok 'a test request sends one test e-mail and writes "sent" back'
else
  bad "test mail: $result"
fi
run >/dev/null
if [[ "$(mails)" == $((before + 1)) ]]; then ok 'the same request is not sent twice'; else bad 'sent twice'; fi
: >"$work/alerts/outage-alert-address"
echo '2026-11-14T20:05:00.000Z' >"$work/alerts/outage-test-request"
run >/dev/null
if [[ "$(cat "$work/alerts/outage-test-result")" == 'failed 2026-11-14T20:05:00.000Z '*'no outage alert address'* ]]; then
  ok 'without an address the test says why it failed'
else
  bad "no-address test: $(cat "$work/alerts/outage-test-result")"
fi

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
