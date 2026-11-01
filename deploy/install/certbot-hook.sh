#!/bin/bash
# ============================================================
# File:        certbot-hook.sh
# Path:        deploy/install/certbot-hook.sh
# Project:     Seasonal Entertainment
# Description: certbot's deploy hook in nginx mode (installed by deploy/install.sh as
#              /etc/letsencrypt/renewal-hooks/deploy/seasonal.sh): after certbot renewed one of
#              the installer's certificates, nginx reloads (after nginx -t) to serve it, and the
#              calls certificate is copied to the call service's TURN (LiveKit reads
#              fullchain.pem and privkey.pem from /etc/seasonal/calls-cert), which restarts when
#              it runs. Other certificates on the server are left alone. certbot sets
#              RENEWED_LINEAGE; the installer runs it once by hand with that variable set.
# ============================================================

set -euo pipefail

CERT_DIR=/etc/seasonal/calls-cert
STATE_FILE=/etc/seasonal/install.conf
lineage="${RENEWED_LINEAGE:-}"

case "$lineage" in
  */seasonal-site | */seasonal-calls) ;;
  *) exit 0 ;; # not one of ours
esac

# An unchanged certificate (every installer re-run calls this) leaves LiveKit and its calls alone.
if [[ "$lineage" == */seasonal-calls ]] && ! cmp -s "$lineage/fullchain.pem" "$CERT_DIR/fullchain.pem"; then
  install -d -m 755 "$CERT_DIR"
  install -m 644 "$lineage/fullchain.pem" "$CERT_DIR/fullchain.pem"
  install -m 600 "$lineage/privkey.pem" "$CERT_DIR/privkey.pem"
  install_dir="$(sed -n 's/^INSTALL_DIR=//p' "$STATE_FILE" 2>/dev/null | tail -n 1)"
  # Restarted only when it runs: on the first install the certificate comes before LiveKit.
  if [[ -n "$install_dir" ]] && docker ps --format '{{.Names}}' | grep -qx 'seasonal-calls-livekit-1'; then
    (cd "$install_dir/deploy/calls" && docker compose --progress quiet restart livekit >/dev/null)
  fi
fi

if systemctl is-active --quiet nginx && nginx -t >/dev/null 2>&1; then
  systemctl reload nginx
fi
