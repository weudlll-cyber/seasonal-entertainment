#!/bin/bash
# shellcheck source-path=SCRIPTDIR
# ============================================================
# File:        install.sh
# Path:        deploy/install.sh
# Project:     Seasonal Entertainment
# Description: The one-command installer (docs/DEPLOYMENT.md): run as root from a checkout of
#              the repository on an Ubuntu 22.04 or 24.04 server, `sudo ./deploy/install.sh`. It
#              asks for the domains and options (or reads an answers file), takes the site's own
#              Caddy on an empty server or works beside an nginx already there, installs Docker
#              if missing, makes every secret on the server, builds and starts the site (and the
#              call service with recording, if chosen), creates the first admin and sets up the
#              encrypted backups. Re-running keeps secrets, data and answers. --status,
#              --uninstall [--purge-data], --rollback <snapshot>, --admin, --backups. The parts
#              live in deploy/install/lib/.
# ============================================================

set -Eeuo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$INSTALL_DIR/deploy/install/lib"
# shellcheck source=install/lib/common.sh
source "$LIB/common.sh"
# shellcheck source=install/lib/detect.sh
source "$LIB/detect.sh"
# shellcheck source=install/lib/packages.sh
source "$LIB/packages.sh"
# shellcheck source=install/lib/config.sh
source "$LIB/config.sh"
# shellcheck source=install/lib/firewall.sh
source "$LIB/firewall.sh"
# shellcheck source=install/lib/nginx.sh
source "$LIB/nginx.sh"
# shellcheck source=install/lib/services.sh
source "$LIB/services.sh"
# shellcheck source=install/lib/manage.sh
source "$LIB/manage.sh"

# Any command failing where no step expected it still stops with a message and the rollback.
trap 'die "unexpected failure (line $LINENO: $BASH_COMMAND)"' ERR

ANSWER_KEYS="SITE_DOMAIN WWW_REDIRECT CALLS_DOMAIN RECORDING ACME_EMAIL ADMIN_NAME ADMIN_EMAIL
COINGECKO_API_KEY PRICE_BOT_DB PRICE_BOT_MINING_RATES EVENT_BOT_DB BACKUP_RECIPIENT ACME_SERVER
ACME_CA_BUNDLE"

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/install.sh [options]

  (no action)            install, or update what is installed (asks what it needs)
  --answers FILE         answers for unattended runs (KEY=VALUE; deploy/install/answers.example)
  --yes                  never ask: missing optional answers are "none"
  --commit REF           check out REF (a commit, tag or branch) first, then install it
  --admin                create the first admin (password asked on the terminal)
  --backups              set up or change the encrypted backups (asks for the age public key)
  --status               what is installed and whether it answers
  --uninstall            remove what the installer added; keep data, secrets, certificates
  --uninstall --purge-data   also delete the site's data (asks you to type the site name)
  --rollback DIR         undo a run, back to the snapshot DIR it printed
  -h, --help             this text
EOF
}

ACTION=install
PURGE=no
UNATTENDED=no
ANSWERS=""
COMMIT_REF=""
ROLLBACK_DIR=""
while (($#)); do
  case "$1" in
    --answers) ANSWERS="${2:?--answers needs a file}"; shift ;;
    --yes) UNATTENDED=yes ;;
    --commit) COMMIT_REF="${2:?--commit needs a ref}"; shift ;;
    --admin) ACTION='admin' ;;
    --backups) ACTION=backups ;;
    --status) ACTION=status ;;
    --uninstall) ACTION=uninstall ;;
    --purge-data) PURGE=yes ;;
    --rollback) ACTION=rollback; ROLLBACK_DIR="${2:?--rollback needs a snapshot folder}"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown option $1" ;;
  esac
  shift
done

[[ "$(id -u)" == 0 ]] || die "run as root: sudo $0"
[[ "$PURGE" == no || "$ACTION" == uninstall ]] || die "--purge-data goes with --uninstall"

# A different commit: check it out, then run that commit's own installer (this file may change).
if [[ -n "$COMMIT_REF" && -z "${SEASONAL_REEXEC:-}" ]]; then
  git -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" fetch -q --all --tags || die "git fetch failed"
  git -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" checkout -q "$COMMIT_REF" ||
    die "could not check out $COMMIT_REF (uncommitted changes in $INSTALL_DIR?)"
  say "code: $COMMIT_REF ($(commit_sha | cut -c1-12))"
  args=()
  [[ -z "$ANSWERS" ]] || args+=(--answers "$ANSWERS")
  [[ "$UNATTENDED" == no ]] || args+=(--yes)
  SEASONAL_REEXEC=1 exec "$INSTALL_DIR/deploy/install.sh" "${args[@]}"
fi

# The answers: a file first, then what an earlier run remembered, then the questions.
gather_answers() {
  # shellcheck disable=SC2086 # the key list is split into words on purpose
  [[ -z "$ANSWERS" ]] || read_kv_file "$ANSWERS" $ANSWER_KEYS
  load_state
  ask SITE_DOMAIN "The site's domain (e.g. example.org)"
  ask WWW_REDIRECT "Should www.$SITE_DOMAIN redirect to it? (yes/no)" yes
  ask_optional CALLS_DOMAIN "The call service's domain (e.g. calls.$SITE_DOMAIN)"
  [[ -z "$CALLS_DOMAIN" ]] && RECORDING=no
  ask RECORDING "Record calls? (yes/no)" no
  ask ACME_EMAIL "Email address for Let's Encrypt (certificate notices)"
  ask_optional PRICE_BOT_DB "The price bot's snapshots.db on this server"
  ask_optional PRICE_BOT_MINING_RATES "The price bot's mining_rates.json"
  ask_optional EVENT_BOT_DB "The event bot's database"
  ask_optional BACKUP_RECIPIENT "The age public key for encrypted backups (age1…; can be added later with --backups)"
  if [[ -z "${COINGECKO_API_KEY+set}" && "$UNATTENDED" == no ]] && have_tty &&
    [[ -z "$(kv_get "$(site_env)" COINGECKO_API_KEY)" ]]; then
    ask_secret COINGECKO_API_KEY "CoinGecko Demo API key for ETH/POL/BTC prices (empty: none; not shown)"
  fi
  : "${ACME_SERVER:=}" "${ACME_CA_BUNDLE:=}" "${ADMIN_DONE:=no}"
}

validate_answers() {
  local domain_re='^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$' file
  [[ "$SITE_DOMAIN" =~ $domain_re ]] || die "not a domain name: $SITE_DOMAIN"
  [[ -z "$CALLS_DOMAIN" || "$CALLS_DOMAIN" =~ $domain_re ]] || die "not a domain name: $CALLS_DOMAIN"
  [[ "$CALLS_DOMAIN" != "$SITE_DOMAIN" ]] || die "the calls domain must differ from the site's"
  [[ "$WWW_REDIRECT" == yes || "$WWW_REDIRECT" == no ]] || die "WWW_REDIRECT is yes or no"
  [[ "$RECORDING" == yes || "$RECORDING" == no ]] || die "RECORDING is yes or no"
  [[ "$ACME_EMAIL" == *@*.* ]] || die "not an email address: $ACME_EMAIL"
  # Docker would make a missing bind source an empty folder; refuse instead.
  for file in "$PRICE_BOT_DB" "$PRICE_BOT_MINING_RATES" "$EVENT_BOT_DB" "$ACME_CA_BUNDLE"; do
    [[ -z "$file" || -f "$file" ]] || die "no such file: $file"
  done
}

install_all() {
  check_os
  gather_answers
  validate_answers
  decide_mode
  take_snapshot
  ensure_base_tools
  ensure_docker
  [[ "$MODE" == caddy ]] || local_port_free "$SITE_LOCAL_PORT" ||
    docker ps --format '{{.Names}}' | grep -qx seasonal-site-site-1 ||
    die "port $SITE_LOCAL_PORT is taken on this server; the site needs it on 127.0.0.1"
  write_site_env
  write_site_compose_env
  write_install_compose
  write_caddy_sites
  save_state
  open_ports
  [[ "$MODE" == caddy ]] || setup_nginx
  start_site
  wait_health
  start_calls
  install_admin
  install_backups
  save_state
  say "done: https://$SITE_DOMAIN"
  say "KEEP SAFE: copy the key that encrypts 2FA secrets off this server now, e.g. from your PC:"
  say "  scp root@<this server>:$KEY_COPY ./seasonal-secret-encryption-key"
  say "  (and keep it apart from the backups; without it, 2FA logins cannot be restored)"
  [[ -n "$BACKUP_RECIPIENT" ]] || say "backups are not set up yet: sudo $INSTALL_DIR/deploy/install.sh --backups"
}

case "$ACTION" in
  install) install_all ;;
  status) status ;;
  uninstall) uninstall "$PURGE" ;;
  rollback) rollback "$ROLLBACK_DIR" ;;
  admin)
    load_state
    [[ -f "$STATE_FILE" ]] || die "install first"
    ADMIN_DONE=no
    write_site_env
    compose_site up -d site >/dev/null 2>&1
    wait_health
    install_admin
    ;;
  backups)
    load_state
    [[ -f "$STATE_FILE" ]] || die "install first"
    BACKUP_RECIPIENT=""
    ask BACKUP_RECIPIENT "The age public key for encrypted backups (age1…)"
    save_state
    install_backups
    save_state
    ;;
esac
