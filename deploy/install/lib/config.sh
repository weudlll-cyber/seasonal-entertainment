# shellcheck shell=bash
# ============================================================
# File:        config.sh
# Path:        deploy/install/lib/config.sh
# Project:     Seasonal Entertainment
# Description: The installer's configuration files (docs/DEPLOYMENT.md): deploy/site/site.env
#              (the app), deploy/site/.env and deploy/calls/.env (compose), all mode 600, with
#              every secret made here and never printed; a secret already there is kept, so a
#              re-run changes nothing that works (the KEEP SAFE note for the 2FA key is due only
#              when the key is made here). Also the installer's compose file
#              (deploy/site/docker-compose.install.yml, chosen through COMPOSE_FILE) and the
#              extra Caddy site files (www redirect, calls domain) in /etc/seasonal/caddy-sites.
# ============================================================

SITE_DIR_REL=deploy/site
CALLS_DIR_REL=deploy/calls
CALLS_CERT_DIR="$STATE_DIR/calls-cert"
CADDY_SITES_DIR="$STATE_DIR/caddy-sites"
KEY_COPY="$STATE_DIR/secret-encryption-key"
SITE_LOCAL_PORT=3800
BACKUP_HOST_DIR=/var/backups/seasonal
# The calls API key name (the secret beside it is random); LiveKit and the site share the pair.
CALLS_API_KEY_NAME=seasonal

site_env() { echo "$INSTALL_DIR/$SITE_DIR_REL/site.env"; }
site_compose_env() { echo "$INSTALL_DIR/$SITE_DIR_REL/.env"; }
calls_env() { echo "$INSTALL_DIR/$CALLS_DIR_REL/.env"; }

# kv_keep FILE KEY GENERATOR...: sets KEY from the generator only when it has no value yet.
kv_keep() {
  local file="$1" key="$2"
  shift 2
  [[ -n "$(kv_get "$file" "$key")" ]] || kv_set "$file" "$key" "$("$@")"
}

commit_sha() {
  git_here rev-parse HEAD 2>/dev/null || echo unknown
}

write_site_env() {
  local file
  file="$(site_env)"
  say "writing $SITE_DIR_REL/site.env (mode 600; secrets generated here, never shown)"
  kv_keep "$file" SESSION_SECRET new_secret hex
  # A key made now must be copied off the server: install_all says so once (KEY_NOTE, state).
  # shellcheck disable=SC2034 # read by install_all (install.sh) and save_state
  [[ -n "$(kv_get "$file" SECRET_ENCRYPTION_KEY)" ]] || KEY_NOTE=pending
  kv_keep "$file" SECRET_ENCRYPTION_KEY new_secret base64
  # A root-only copy of the key that encrypts 2FA secrets: losing it locks every 2FA login.
  install -d -m 700 "$STATE_DIR"
  install -m 600 /dev/null "$KEY_COPY.tmp"
  kv_get "$file" SECRET_ENCRYPTION_KEY >"$KEY_COPY.tmp"
  mv "$KEY_COPY.tmp" "$KEY_COPY"
  # Only until the first admin exists (install_admin removes it).
  [[ "${ADMIN_DONE:-no}" == yes ]] || kv_keep "$file" BOOTSTRAP_TOKEN new_secret hex
  if [[ -n "${CALLS_DOMAIN:-}" ]]; then
    kv_set "$file" CALLS_URL "wss://$CALLS_DOMAIN"
    kv_set "$file" CALLS_API_KEY "$CALLS_API_KEY_NAME"
    kv_keep "$file" CALLS_API_SECRET new_secret hex
  else
    kv_unset "$file" CALLS_URL
  fi
  if [[ "${RECORDING:-no}" == yes && -n "${CALLS_DOMAIN:-}" ]]; then
    kv_set "$file" CALLS_RECORDINGS_DIR /data/media/recordings
    kv_set "$file" CALLS_EGRESS_OUTPUT_DIR /recordings
  else
    kv_unset "$file" CALLS_RECORDINGS_DIR
    kv_unset "$file" CALLS_EGRESS_OUTPUT_DIR
  fi
  # The bots' files appear in the container at fixed paths (docker-compose.install.yml).
  if [[ -n "${PRICE_BOT_DB:-}" ]]; then kv_set "$file" PRICE_BOT_DB /bots/snapshots.db; else kv_unset "$file" PRICE_BOT_DB; fi
  if [[ -n "${PRICE_BOT_MINING_RATES:-}" ]]; then kv_set "$file" PRICE_BOT_MINING_RATES /bots/mining_rates.json; else kv_unset "$file" PRICE_BOT_MINING_RATES; fi
  if [[ -n "${EVENT_BOT_DB:-}" ]]; then kv_set "$file" EVENT_BOT_DB /bots/events.db; else kv_unset "$file" EVENT_BOT_DB; fi
  if [[ -n "${COINGECKO_API_KEY:-}" ]]; then
    kv_set "$file" COINGECKO_API_KEY "$COINGECKO_API_KEY"
  elif [[ "${ASK_COINGECKO:-no}" == yes && "${COINGECKO:-}" == none ]]; then
    # --coingecko answered with Enter: no key any more (only then; a key put into site.env by
    # hand stays on a plain re-run).
    kv_unset "$file" COINGECKO_API_KEY
  fi
  [[ -z "${BACKUP_RECIPIENT:-}" ]] || kv_set "$file" BACKUP_RECIPIENT "$BACKUP_RECIPIENT"
  # The Discord login (discord.sh): its ids and secret, or none.
  discord_site_env "$file"
  # The embedded games (games.sh): their list and the sync token, or neither.
  games_site_env "$file"
  # Web push (push.sh): the key pair, made once.
  push_site_env "$file"
  # The site shows the bot's admin page and answers nginx's question about it only when on.
  if bot_admin_on; then kv_set "$file" BOT_ADMIN_EMBEDDED 1; else kv_unset "$file" BOT_ADMIN_EMBEDDED; fi
}

write_site_compose_env() {
  local file files=docker-compose.yml:docker-compose.install.yml
  file="$(site_compose_env)"
  kv_set "$file" COMPOSE_FILE "$files"
  kv_set "$file" SITE_DOMAIN "$SITE_DOMAIN"
  kv_set "$file" CALLS_DOMAIN "${CALLS_DOMAIN:-}"
  kv_set "$file" ACME_EMAIL "$ACME_EMAIL"
  kv_set "$file" COMMIT_SHA "$(commit_sha)"
  kv_set "$file" BACKUP_HOST_DIR "$BACKUP_HOST_DIR"
  kv_set "$file" CADDY_SITES_DIR "$CADDY_SITES_DIR"
  kv_set "$file" ACME_CA "${ACME_SERVER:-https://acme-v02.api.letsencrypt.org/directory}"
}

# The installer's own compose file: what differs from the repository's docker-compose.yml.
write_install_compose() {
  local file="$INSTALL_DIR/$SITE_DIR_REL/docker-compose.install.yml"
  {
    echo "# Written by deploy/install.sh: do not edit; run the installer again instead."
    echo "services:"
    echo "  site:"
    echo "    labels:"
    echo "      seasonal.installed-by: install.sh"
    if [[ "$MODE" == nginx ]]; then
      echo "    # nginx on this host forwards to it; loopback only, so nothing else reaches it."
      echo "    ports: ['127.0.0.1:$SITE_LOCAL_PORT:3800']"
    fi
    if [[ -n "${PRICE_BOT_DB:-}${PRICE_BOT_MINING_RATES:-}${EVENT_BOT_DB:-}" ]]; then
      echo "    volumes:"
      [[ -z "${PRICE_BOT_DB:-}" ]] || echo "      - $PRICE_BOT_DB:/bots/snapshots.db:ro"
      [[ -z "${PRICE_BOT_MINING_RATES:-}" ]] || echo "      - $PRICE_BOT_MINING_RATES:/bots/mining_rates.json:ro"
      [[ -z "${EVENT_BOT_DB:-}" ]] || echo "      - $EVENT_BOT_DB:/bots/events.db:ro"
    fi
    echo "  caddy:"
    if [[ "$MODE" == nginx ]]; then
      echo "    # nginx holds ports 80/443: Caddy is never started (only with --profile caddy)."
      echo "    profiles: [caddy]"
    fi
    if [[ -n "${ACME_CA_BUNDLE:-}" ]]; then
      echo "    # The ACME server's own certificate authority (a staging or test CA)."
      echo "    environment:"
      echo "      SSL_CERT_FILE: /etc/seasonal-acme-ca.pem"
      echo "    volumes:"
      echo "      - $ACME_CA_BUNDLE:/etc/seasonal-acme-ca.pem:ro"
    else
      echo "    labels:"
      echo "      seasonal.installed-by: install.sh"
    fi
  } >"$file"
}

# The extra Caddy site files (caddy mode): only what the answers call for.
write_caddy_sites() {
  install -d -m 755 "$CADDY_SITES_DIR"
  rm -f "$CADDY_SITES_DIR"/*.caddy
  if [[ "${WWW_REDIRECT:-no}" == yes ]]; then
    install -m 644 "$INSTALL_DIR/deploy/install/caddy/www.caddy" "$CADDY_SITES_DIR/www.caddy"
  fi
  if [[ -n "${CALLS_DOMAIN:-}" ]]; then
    install -m 644 "$INSTALL_DIR/$SITE_DIR_REL/caddy/calls.caddy" "$CADDY_SITES_DIR/calls.caddy"
  fi
}

write_calls_env() {
  local file secret
  file="$(calls_env)"
  secret="$(kv_get "$(site_env)" CALLS_API_SECRET)"
  say "writing $CALLS_DIR_REL/.env (mode 600)"
  if [[ "${RECORDING:-no}" == yes ]]; then
    kv_set "$file" COMPOSE_FILE docker-compose.yml:docker-compose.recording.yml
    kv_set "$file" RECORDINGS_DIR "$(recordings_host_dir)"
    kv_set "$file" LIVEKIT_API_KEY "$CALLS_API_KEY_NAME"
    kv_set "$file" LIVEKIT_API_SECRET "$secret"
  else
    kv_set "$file" COMPOSE_FILE docker-compose.yml
  fi
  kv_set "$file" LIVEKIT_KEYS "$CALLS_API_KEY_NAME: $secret"
  kv_set "$file" CALLS_DOMAIN "$CALLS_DOMAIN"
  kv_set "$file" CALLS_CERT_DIR "$CALLS_CERT_DIR"
  kv_set "$file" ACME_EMAIL "$ACME_EMAIL"
  kv_set "$file" LIVEKIT_BIND "$(livekit_bind)"
}

# Where LiveKit's signalling port 7880 listens (deploy/calls/docker-compose.yml). nginx reaches
# it on 127.0.0.1; the site's Caddy container in Caddy mode only over the Docker bridge, so there
# it stays on every address, closed to the outside by the firewall alone.
livekit_bind() {
  if [[ "${MODE:-}" == caddy ]]; then echo 0.0.0.0; else echo 127.0.0.1; fi
}

# The site's data folder (its /data) as the host sees it: the outage watchdog reads it there.
site_data_host_dir() {
  docker volume inspect seasonal-site_site-data --format '{{ .Mountpoint }}' 2>/dev/null ||
    die "the site's data volume does not exist yet"
}

# The site's media/recordings folder as the host sees it (the egress writes there).
recordings_host_dir() {
  echo "$(site_data_host_dir)/media/recordings"
}
