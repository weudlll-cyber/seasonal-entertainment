#!/bin/sh
# ============================================================
# File:        calls-cert.sh
# Path:        deploy/site/calls-cert.sh
# Project:     Seasonal Entertainment
# Description: Hands the calls domain's certificate, which Caddy gets and renews, to LiveKit's
#              TURN server (deploy/calls/livekit.yaml reads fullchain.pem and privkey.pem from
#              CALLS_CERT_DIR) and restarts LiveKit when it changed. Run on the VPS that runs
#              Caddy for the calls domain, by the seasonal-calls-cert timer (systemd/), as
#              root. Usage: calls-cert.sh <caddy container> <calls domain> <cert dir> <calls dir>
#              e.g. calls-cert.sh seasonal-site-caddy-1 calls.example.org /etc/seasonal/calls-cert
#              /opt/seasonal-entertainment/deploy/calls
# ============================================================

set -eu
CADDY="$1"
DOMAIN="$2"
CERT_DIR="$3"
CALLS_DIR="$4"
# Caddy's storage: one folder per domain under the ACME directory (Let's Encrypt).
SOURCE="/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$DOMAIN"

mkdir -p "$CERT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
docker exec "$CADDY" cat "$SOURCE/$DOMAIN.crt" > "$TMP/fullchain.pem"
docker exec "$CADDY" cat "$SOURCE/$DOMAIN.key" > "$TMP/privkey.pem"

# Unchanged: nothing to do (LiveKit keeps running).
if cmp -s "$TMP/fullchain.pem" "$CERT_DIR/fullchain.pem" 2>/dev/null; then
  exit 0
fi
install -m 0644 "$TMP/fullchain.pem" "$CERT_DIR/fullchain.pem"
install -m 0600 "$TMP/privkey.pem" "$CERT_DIR/privkey.pem"
docker compose -f "$CALLS_DIR/docker-compose.yml" restart livekit
echo "calls-cert: new certificate for $DOMAIN handed to LiveKit"
