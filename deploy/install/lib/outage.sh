# shellcheck shell=bash
# ============================================================
# File:        outage.sh
# Path:        deploy/install/lib/outage.sh
# Project:     Seasonal Entertainment
# Description: The outage e-mails (docs/DEPLOYMENT.md, "An e-mail when the site is down";
#              decided 2026-11-14). Optional questions for the mail account that sends them
#              (SMTP server, port, user, password; e.g. a Gmail address with a Google app
#              password): the account goes into the root-only OUTAGE_SMTP_FILE (mode 600), the
#              password never printed, and the file is kept on every later run and --update.
#              An empty server answer means no e-mails, remembered as OUTAGE_MAIL=none and not
#              asked again; --outage-mail asks again. The watchdog itself
#              (deploy/site/watchdog/seasonal-watchdog.sh) is installed with its systemd timer
#              on every run, so the admin page's address works once an account is set up.
# ============================================================

OUTAGE_SMTP_FILE="${OUTAGE_SMTP_FILE:-/etc/seasonal/outage-smtp}"
WATCHDOG_ENV_FILE="${WATCHDOG_ENV_FILE:-/etc/seasonal/watchdog.env}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"

# The questions, before anything changes (gather_answers). A file of answers may give
# OUTAGE_SMTP_HOST, _PORT, _USER and OUTAGE_SMTP_PASSWORD_FILE (a file holding the password).
ask_outage_mail() {
  if [[ "${ASK_OUTAGE_MAIL:-no}" == yes ]]; then
    OUTAGE_MAIL=""
    unset OUTAGE_SMTP_HOST
  elif [[ -n "$(kv_get "$OUTAGE_SMTP_FILE" SMTP_HOST)" || "${OUTAGE_MAIL:-}" == none ]]; then
    return 0 # kept as it is: set up earlier, or declined earlier
  fi
  ask_optional OUTAGE_SMTP_HOST "SMTP server for outage e-mails (e.g. smtp.gmail.com; empty: no e-mails)"
  if [[ -z "$OUTAGE_SMTP_HOST" ]]; then
    # Unattended runs remember nothing, so the next run on a terminal still asks.
    [[ "${UNATTENDED:-no}" == yes ]] || OUTAGE_MAIL="none"
    return 0
  fi
  ask OUTAGE_SMTP_PORT "Its port (587: STARTTLS, 465: TLS)" 587
  ask OUTAGE_SMTP_USER "The account's user name (the full address for Gmail)"
  if [[ -n "${OUTAGE_SMTP_PASSWORD_FILE:-}" ]]; then
    [[ -f "$OUTAGE_SMTP_PASSWORD_FILE" ]] || die "no such file: $OUTAGE_SMTP_PASSWORD_FILE"
    OUTAGE_SMTP_PASSWORD="$(head -n 1 "$OUTAGE_SMTP_PASSWORD_FILE")"
  else
    ask_secret OUTAGE_SMTP_PASSWORD "Its password (for Gmail a Google app password; not shown)"
  fi
  [[ "${OUTAGE_SMTP_PORT:-}" =~ ^[0-9]+$ ]] || die "OUTAGE_SMTP_PORT is a number"
  OUTAGE_MAIL="set"
}

# The account, root only. Written only when this run asked for it: a later run keeps the file.
write_outage_smtp() {
  [[ -n "${OUTAGE_SMTP_HOST:-}" && -n "${OUTAGE_SMTP_PASSWORD:-}" ]] || return 0
  install -d -m 755 "$(dirname "$OUTAGE_SMTP_FILE")"
  rm -f "$OUTAGE_SMTP_FILE"
  install -m 600 /dev/null "$OUTAGE_SMTP_FILE"
  kv_set "$OUTAGE_SMTP_FILE" SMTP_HOST "$OUTAGE_SMTP_HOST"
  kv_set "$OUTAGE_SMTP_FILE" SMTP_PORT "$OUTAGE_SMTP_PORT"
  kv_set "$OUTAGE_SMTP_FILE" SMTP_USER "$OUTAGE_SMTP_USER"
  kv_set "$OUTAGE_SMTP_FILE" SMTP_FROM "$OUTAGE_SMTP_USER"
  kv_set "$OUTAGE_SMTP_FILE" SMTP_PASSWORD "$OUTAGE_SMTP_PASSWORD"
  unset OUTAGE_SMTP_PASSWORD
  say "outage e-mails: the mail account is in $OUTAGE_SMTP_FILE (root only; the password is never shown)"
}

# The watchdog's settings (no secret in them) and its timer, every 2 minutes. alert_dir: the
# site's data folder as the host sees it (the volume's mount point).
install_watchdog() {
  local alert_dir="$1" calls_url=''
  local resolve="$SITE_DOMAIN:443:127.0.0.1"
  if [[ -n "${CALLS_DOMAIN:-}" ]]; then
    calls_url="https://$CALLS_DOMAIN/"
    resolve="$resolve $CALLS_DOMAIN:443:127.0.0.1"
  fi
  install -d -m 755 "$(dirname "$WATCHDOG_ENV_FILE")"
  {
    echo "# Written by deploy/install.sh: do not edit; run the installer again instead."
    echo "WATCH_SITE_NAME=$SITE_DOMAIN"
    echo "WATCH_SITE_URL=https://$SITE_DOMAIN/api/health"
    echo "WATCH_CALLS_URL=$calls_url"
    echo "WATCH_RESOLVE=$resolve"
    echo "WATCH_ALERT_DIR=$alert_dir"
    echo "WATCH_SMTP_FILE=$OUTAGE_SMTP_FILE"
  } >"$WATCHDOG_ENV_FILE"
  chmod 644 "$WATCHDOG_ENV_FILE"
  sed "s|/opt/seasonal-entertainment|$INSTALL_DIR|g; s|/etc/seasonal/watchdog.env|$WATCHDOG_ENV_FILE|g" \
    "$INSTALL_DIR/$SITE_DIR_REL/systemd/seasonal-watchdog.service" >"$SYSTEMD_DIR/seasonal-watchdog.service"
  install -m 644 "$INSTALL_DIR/$SITE_DIR_REL/systemd/seasonal-watchdog.timer" "$SYSTEMD_DIR/"
  systemctl daemon-reload
  systemctl enable --now seasonal-watchdog.timer >/dev/null 2>&1
  if [[ -f "$OUTAGE_SMTP_FILE" ]]; then
    say "outage e-mails: checked every 2 minutes; the address is Admin → Settings → Alerts"
  else
    say "outage e-mails: no mail account yet (sudo $INSTALL_DIR/deploy/install.sh --outage-mail)"
  fi
}
