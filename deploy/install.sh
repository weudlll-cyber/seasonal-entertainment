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
#              encrypted backups. Re-running keeps secrets, data and answers. --update (a backup, or
#              a local copy without backups, then the newest commit of origin's default branch), --commit <ref>, --coingecko
#              (ask the CoinGecko key again), --discord (ask about the Discord login again),
#              --bot-admin (ask about the event bot's admin page again; nginx mode), --bingo and
#              --mini-games (ask again whether that game is embedded), --status,
#              --uninstall [--purge-data], --rollback <snapshot>,
#              --admin, --backups. The parts live in deploy/install/lib/.
# ============================================================

set -Eeuo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$INSTALL_DIR/deploy/install/lib"
# shellcheck source=install/lib/common.sh
source "$LIB/common.sh"
# Before any other file of the checkout is read: root runs them.
refuse_unsafe_checkout "$INSTALL_DIR"
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
# shellcheck source=install/lib/nginx-default.sh
source "$LIB/nginx-default.sh"
# shellcheck source=install/lib/services.sh
source "$LIB/services.sh"
# shellcheck source=install/lib/manage.sh
source "$LIB/manage.sh"
# shellcheck source=install/lib/update.sh
source "$LIB/update.sh"
# shellcheck source=install/lib/update-copy.sh
source "$LIB/update-copy.sh"
# shellcheck source=install/lib/bot-admin.sh
source "$LIB/bot-admin.sh"
# shellcheck source=install/lib/discord.sh
source "$LIB/discord.sh"
# shellcheck source=install/lib/games.sh
source "$LIB/games.sh"

# Any command failing where no step expected it still stops with a message and the rollback.
trap 'die "unexpected failure (line $LINENO: $BASH_COMMAND)"' ERR

ANSWER_KEYS="SITE_DOMAIN WWW_REDIRECT CALLS_DOMAIN RECORDING ACME_EMAIL ADMIN_NAME ADMIN_EMAIL
COINGECKO_API_KEY PRICE_BOT_DB PRICE_BOT_MINING_RATES EVENT_BOT_DB BACKUP_RECIPIENT ACME_SERVER
ACME_CA_BUNDLE BOT_ADMIN_URL BOT_ADMIN_TOKEN_FILE BOT_ADMIN_TOKEN_KEY DISCORD_CLIENT_ID
DISCORD_GUILD_ID DISCORD_CLIENT_SECRET_FILE BINGO MINI_GAMES"

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/install.sh [options]

  (no action)            install, or update what is installed (asks what it needs)
  --answers FILE         answers for unattended runs (KEY=VALUE; deploy/install/answers.example)
  --yes                  never ask: missing optional answers are "none"
  --update               a fresh backup (if set up), then the newest code of origin's default
                         branch (fast-forward only), installed as a plain re-run does
  --coingecko            ask for the CoinGecko Demo API key again (once answered, also with
                         Enter for none, it is not asked again); Enter now removes a key
  --discord              ask again for the Discord login's client id, server id and secret
                         (once answered, also with Enter for none, it is not asked again);
                         Enter now removes them
  --bot-admin            nginx mode: ask again about the event bot's admin page inside the
                         site (its address and token); Enter now removes it
  --bingo                ask again whether Seasonal Bingo Royale is embedded at /games/bingo
  --mini-games           ask again whether Seasonal Mini Games is embedded at /games/mini-games
  --commit REF           check out REF (a commit, tag or branch) first, then install it
  --admin                create the first admin (password asked on the terminal)
  --backups              set up or change the encrypted backups (asks for the age public key)
  --status               what is installed and whether it answers
  --uninstall            remove what the installer added; keep data, secrets, certificates
  --uninstall --purge-data   also delete the site's data (asks you to type the site name)
  --rollback DIR         undo a run, back to the snapshot DIR it printed
  -h, --help             this text

KEEP SAFE: /etc/seasonal/secret-encryption-key is the key that encrypts 2FA secrets. Copy it
off this server and keep it apart from the backups; without it, 2FA logins cannot be restored:
  scp root@<this server>:/etc/seasonal/secret-encryption-key ./seasonal-secret-encryption-key
EOF
}

ACTION=install
PURGE=no
UNATTENDED=no
ANSWERS=""
COMMIT_REF=""
UPDATE=no
ASK_COINGECKO=no
ASK_BOT_ADMIN=no
ASK_DISCORD=no
ASK_BINGO=no
ASK_MINI_GAMES=no
ROLLBACK_DIR=""
while (($#)); do
  case "$1" in
    --answers) ANSWERS="${2:?--answers needs a file}"; shift ;;
    --yes) UNATTENDED=yes ;;
    --commit) COMMIT_REF="${2:?--commit needs a ref}"; shift ;;
    --update) UPDATE=yes ;;
    --coingecko) ASK_COINGECKO=yes ;;
    --bot-admin) ASK_BOT_ADMIN=yes ;;
    --discord) ASK_DISCORD=yes ;;
    --bingo) ASK_BINGO=yes ;;
    --mini-games) ASK_MINI_GAMES=yes ;;
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
[[ "$UPDATE" == no || -z "$COMMIT_REF" ]] ||
  die "--update and --commit do not go together: --update takes the newest code, --commit REF a chosen one"
[[ "$UPDATE" == no || "$ACTION" == install ]] || die "--update goes alone (with --answers, --yes, --coingecko, --discord, --bot-admin, --bingo or --mini-games at most)"
[[ "$ASK_DISCORD" == no || "$ACTION" == install ]] || die "--discord goes with an install, a re-run or --update"
[[ "$ASK_DISCORD" == no || "$UNATTENDED" == no ]] || die "--discord asks on the terminal: not with --yes"
[[ "$ASK_BINGO" == no || "$ACTION" == install ]] || die "--bingo goes with an install, a re-run or --update"
[[ "$ASK_BINGO" == no || "$UNATTENDED" == no ]] || die "--bingo asks on the terminal: not with --yes"
[[ "$ASK_MINI_GAMES" == no || "$ACTION" == install ]] || die "--mini-games goes with an install, a re-run or --update"
[[ "$ASK_MINI_GAMES" == no || "$UNATTENDED" == no ]] || die "--mini-games asks on the terminal: not with --yes"
[[ "$ASK_COINGECKO" == no || "$ACTION" == install ]] || die "--coingecko goes with an install, a re-run or --update"
[[ "$ASK_COINGECKO" == no || "$UNATTENDED" == no ]] || die "--coingecko asks on the terminal: not with --yes"
[[ "$ASK_BOT_ADMIN" == no || "$ACTION" == install ]] || die "--bot-admin goes with an install, a re-run or --update"
[[ "$ASK_BOT_ADMIN" == no || "$UNATTENDED" == no ]] || die "--bot-admin asks on the terminal: not with --yes"

# A different commit: check it out, then run that commit's own installer (this file may change).
if [[ -n "$COMMIT_REF" && -z "${SEASONAL_REEXEC:-}" ]]; then
  git_here fetch -q --all --tags || die "git fetch failed"
  git_here checkout -q "$COMMIT_REF" || die "could not check out $COMMIT_REF (uncommitted changes in $INSTALL_DIR?)"
  say "code: $COMMIT_REF ($(commit_sha | cut -c1-12))"
  reexec_installer
fi
# The newest code: backup, fast-forward, then that commit's installer (update.sh).
[[ "$UPDATE" == no || -n "${SEASONAL_REEXEC:-}" ]] || update_installed

# Shown before the calls and recording questions, only when they are really asked: what the
# feature is, what it needs, and the safe answer for someone who is not sure.
calls_explanation() {
  cat <<EOF
Calls are voice and video rooms on the site: a stage with up to 10 speakers (camera, screen
sharing) and up to 200 listeners, with a chat beside it. They need:
  - a second domain name for the call service, e.g. calls.$SITE_DOMAIN, whose DNS A record
    already points at this server;
  - more open ports: 7881/tcp, 3478/udp, 5349/tcp and 50000-50499/udp;
  - about one more CPU core per busy call.
Not sure? Leave it empty: the site works fully without calls, and they can be added later
(docs/DEPLOYMENT.md, "Changing an answer later").
EOF
}

recording_explanation() {
  cat <<'EOF'
Recording lets organisers and admins record a call (video and sound). Everyone in the call
sees that it is recorded and must agree before joining. Recordings are kept on this server
with the site's uploads (up to about 480 MB per recorded hour) and go into the backups; a
running recording needs about two more CPU cores (up to three).
Not sure? Answer no: it can be switched on later the same way.
EOF
}

# The answers: a file first, then what an earlier run remembered, then the questions.
gather_answers() {
  # shellcheck disable=SC2086 # the key list is split into words on purpose
  [[ -z "$ANSWERS" ]] || read_kv_file "$ANSWERS" $ANSWER_KEYS
  # --bot-admin: the remembered answer does not count, one in the answers file does.
  [[ "$ASK_BOT_ADMIN" == no || -n "${BOT_ADMIN_URL:-}" ]] || BOT_ADMIN_REASK=yes
  load_state
  ask SITE_DOMAIN "The site's domain (e.g. example.org)"
  ask WWW_REDIRECT "Should www.$SITE_DOMAIN redirect to it? (yes/no)" yes
  ask_optional CALLS_DOMAIN "The call service's domain (e.g. calls.$SITE_DOMAIN)" "$(calls_explanation)"
  [[ -z "$CALLS_DOMAIN" ]] && RECORDING=no
  ask RECORDING "Record calls? (yes/no)" no "$(recording_explanation)"
  ask ACME_EMAIL "Email address for Let's Encrypt (certificate notices)"
  ask_optional PRICE_BOT_DB "The price bot's snapshots.db on this server"
  ask_optional PRICE_BOT_MINING_RATES "The price bot's mining_rates.json"
  ask_optional EVENT_BOT_DB "The event bot's database"
  ask_optional BACKUP_RECIPIENT "The age public key for encrypted backups (age1…; can be added later with --backups)"
  ask_coingecko
  ask_discord
  ask_games
  : "${ACME_SERVER:=}" "${ACME_CA_BUNDLE:=}" "${ADMIN_DONE:=no}"
}

# The CoinGecko key, a secret: typed on the terminal, stored only in site.env. Asked once: an
# empty answer is remembered as COINGECKO=none in the state (the answer, never a key), so later
# runs and --update do not ask again; --coingecko asks again (there Enter removes a stored key,
# write_site_env). A key in the answers file is taken as it is. Unattended runs never ask and
# remember nothing, so the next run on a terminal still asks.
ask_coingecko() {
  [[ "$ASK_COINGECKO" == no ]] || COINGECKO=""
  if [[ -n "${COINGECKO_API_KEY:-}" ]]; then
    COINGECKO=""
    return 0
  fi
  [[ "$ASK_COINGECKO" == yes || -z "$(kv_get "$(site_env)" COINGECKO_API_KEY)" ]] || return 0
  [[ -z "${COINGECKO_API_KEY+set}" && "${COINGECKO:-}" != none && "$UNATTENDED" == no ]] || return 0
  if ! have_tty; then
    [[ "$ASK_COINGECKO" == no ]] || die "--coingecko needs a terminal"
    return 0
  fi
  ask_secret COINGECKO_API_KEY "CoinGecko Demo API key for ETH/POL/BTC prices (empty: none, not asked again; not shown)"
  [[ -n "$COINGECKO_API_KEY" ]] || COINGECKO=none
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
  # Asked once the mode is known (nginx mode only), still before anything changes.
  ask_bot_admin
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
  # Once, at the end of the first install that finishes (write_site_env made the key and set
  # KEY_NOTE=pending; a first run that stopped earlier shows it on the next run); --help and
  # docs/DEPLOYMENT.md keep saying it.
  if [[ "${KEY_NOTE:-}" == pending ]]; then
    say "KEEP SAFE: copy the key that encrypts 2FA secrets off this server now, e.g. from your PC:"
    say "  scp root@<this server>:$KEY_COPY ./seasonal-secret-encryption-key"
    say "  (and keep it apart from the backups; without it, 2FA logins cannot be restored)"
    KEY_NOTE=shown
    save_state
  fi
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
