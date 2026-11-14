#!/bin/bash
# ============================================================
# File:        seasonal-watchdog.sh
# Path:        deploy/site/watchdog/seasonal-watchdog.sh
# Project:     Seasonal Entertainment
# Description: The outage watchdog on the host (docs/DEPLOYMENT.md, "An e-mail when the site is
#              down"; decided 2026-11-14), run every 2 minutes by seasonal-watchdog.timer,
#              outside the site's container, so it works while the site is down. It checks the
#              site's /api/health and, where calls are set up, the call service; after 2 failed
#              checks in a row it sends one "down" e-mail, and once both answer again one "back
#              up" e-mail, nothing in between. It also sends the admin page's "Send a test
#              e-mail" and writes back how that went. The recipient comes from a file the site
#              writes (server/src/alerts/outageFiles.js), the mail account from the root-only
#              file the installer writes; the password goes to curl on its standard input,
#              never on a command line, and is never printed. Only bash and curl (its SMTP
#              support). Settings, all from the environment (the timer's unit sets them):
#              WATCH_SITE_URL, WATCH_CALLS_URL (empty: no call service), WATCH_RESOLVE (curl
#              --resolve entries, so the public names are asked on this host), WATCH_ALERT_DIR
#              (the site's data folder), WATCH_STATE_DIR, WATCH_SMTP_FILE, WATCH_SITE_NAME.
# ============================================================

set -u

: "${WATCH_SITE_URL:?WATCH_SITE_URL is needed}" "${WATCH_ALERT_DIR:?WATCH_ALERT_DIR is needed}"
WATCH_CALLS_URL="${WATCH_CALLS_URL:-}"
WATCH_STATE_DIR="${WATCH_STATE_DIR:-/var/lib/seasonal-watchdog}"
WATCH_SMTP_FILE="${WATCH_SMTP_FILE:-/etc/seasonal/outage-smtp}"
WATCH_SITE_NAME="${WATCH_SITE_NAME:-the site}"
WATCH_TIMEOUT="${WATCH_TIMEOUT:-10}"
# Two failed checks in a row (2 to 4 minutes): one slow answer or a restart sends nothing.
FAILS_FOR_DOWN=2
STATE="$WATCH_STATE_DIR/state"
# The public names answered by this host's own web server: what members reach, without DNS.
resolve=()
for entry in ${WATCH_RESOLVE:-}; do resolve+=(--resolve "$entry"); done
# One plain address, as the site's setting allows (settings/groups/alerts.js): one recipient,
# nothing that could start a header of its own.
ADDRESS_RE='^[^][:space:]@<>()",;:\\[]+@[^][:space:]@<>()",;:\\[]+\.[^][:space:]@<>()",;:\\[]+$'

kv() { sed -n "s/^$2=//p" "$1" 2>/dev/null | tail -n 1; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

recipient() {
  local address
  address="$(head -n 1 "$WATCH_ALERT_DIR/outage-alert-address" 2>/dev/null | tr -d '\r')"
  [[ "$address" =~ $ADDRESS_RE ]] && printf '%s' "$address"
}

# send_mail TO SUBJECT BODY: through the account in WATCH_SMTP_FILE (SMTP_HOST, SMTP_PORT,
# SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_TLS: starttls, tls or none). Sets REASON on failure.
send_mail() {
  local to="$1" subject="$2" body="$3" host port user from tls url password message sent
  local -a secure=()
  host="$(kv "$WATCH_SMTP_FILE" SMTP_HOST)"
  port="$(kv "$WATCH_SMTP_FILE" SMTP_PORT)"
  user="$(kv "$WATCH_SMTP_FILE" SMTP_USER)"
  from="$(kv "$WATCH_SMTP_FILE" SMTP_FROM)"
  tls="$(kv "$WATCH_SMTP_FILE" SMTP_TLS)"
  if [[ -z "$host" ]]; then
    REASON='no mail account is set up (sudo deploy/install.sh --outage-mail)'
    return 1
  fi
  port="${port:-587}"
  from="${from:-$user}"
  [[ -n "$tls" ]] || { [[ "$port" == 465 ]] && tls=tls || tls=starttls; }
  case "$tls" in
    tls) url="smtps://$host:$port" ;;
    starttls) url="smtp://$host:$port" secure=(--ssl-reqd) ;;
    none) url="smtp://$host:$port" ;;
    *) REASON="SMTP_TLS is starttls, tls or none" && return 1 ;;
  esac
  password="$(kv "$WATCH_SMTP_FILE" SMTP_PASSWORD)"
  # curl's config on its standard input: the password is in no process's command line. In a
  # quoted config value a backslash and a double quote are escaped.
  password="${password//\\/\\\\}"
  password="${password//\"/\\\"}"
  # The message (no secret in it) in the watchdog's own folder, gone after the send.
  message="$WATCH_STATE_DIR/message.eml"
  printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n' \
    "$from" "$to" "$subject" "$(date -R)" "$body" >"$message"
  REASON="$(
    { [[ -z "$user" ]] || printf 'user = "%s:%s"\n' "$user" "$password"; } |
      curl -sS --max-time 30 -K - "${secure[@]}" --url "$url" \
        --mail-from "$from" --mail-rcpt "$to" -T "$message" 2>&1 >/dev/null
  )"
  sent=$?
  rm -f "$message"
  if ((sent != 0)); then
    REASON="${REASON:-curl failed}"
    return 1
  fi
}

# notify SUBJECT BODY: 0 when sent or when there is nobody to send to (switched off), 1 when
# sending failed (the state stays as it is, so the next run tries again).
notify() {
  local to
  to="$(recipient)" || { echo "no outage alert address: nothing sent ($1)"; return 0; }
  if send_mail "$to" "$1" "$2"; then
    echo "sent: $1"
  else
    echo "NOT sent ($1): $REASON"
    return 1
  fi
}

check_site() {
  curl -fsS --max-time "$WATCH_TIMEOUT" "${resolve[@]}" "$WATCH_SITE_URL" 2>/dev/null |
    grep -q '"ok":true'
}
check_calls() {
  [[ -z "$WATCH_CALLS_URL" ]] ||
    curl -fsS --max-time "$WATCH_TIMEOUT" "${resolve[@]}" -o /dev/null "$WATCH_CALLS_URL" 2>/dev/null
}

# "Send a test e-mail" on the admin page: the newest request, once; the outcome back to the site.
test_mail() {
  local requested result to
  requested="$(head -n 1 "$WATCH_ALERT_DIR/outage-test-request" 2>/dev/null | tr -d '\r')"
  [[ -n "$requested" && "$requested" != "$(kv "$STATE" tested)" ]] || return 0
  if ! to="$(recipient)"; then
    REASON='no outage alert address is saved'
    result="failed $requested $(now) $REASON"
  elif send_mail "$to" "Test: outage alerts of $WATCH_SITE_NAME" \
    "This is the test e-mail from the admin page. Outage alerts reach this address."; then
    result="sent $requested $(now)"
  else
    result="failed $requested $(now) $REASON"
  fi
  echo "test e-mail: ${result%% *}"
  printf '%s\n' "$result" >"$WATCH_ALERT_DIR/outage-test-result.tmp" &&
    chmod 644 "$WATCH_ALERT_DIR/outage-test-result.tmp" &&
    mv -f "$WATCH_ALERT_DIR/outage-test-result.tmp" "$WATCH_ALERT_DIR/outage-test-result"
  tested="$requested"
}

install -d -m 700 "$WATCH_STATE_DIR"
fails="$(kv "$STATE" fails)"
down="$(kv "$STATE" down)"
tested="$(kv "$STATE" tested)"
fails="${fails:-0}" down="${down:-0}"

failing=''
check_site || failing='the site'
check_calls || failing="${failing:+$failing and }the call service"
if [[ -z "$failing" ]]; then
  if [[ "$down" == 1 ]] && notify "Back up: $WATCH_SITE_NAME" \
    "$WATCH_SITE_NAME and its call service answer again ($(now))."; then
    down=0
  fi
  fails=0
else
  fails=$((fails + 1))
  echo "check failed ($fails in a row): $failing"
  if ((fails >= FAILS_FOR_DOWN)) && [[ "$down" == 0 ]] && notify "Down: $WATCH_SITE_NAME" \
    "$failing did not answer $fails checks in a row, 2 minutes apart (last at $(now)). Another e-mail follows when everything answers again."; then
    down=1
  fi
fi
test_mail
printf 'fails=%s\ndown=%s\ntested=%s\n' "$fails" "$down" "$tested" >"$STATE"
