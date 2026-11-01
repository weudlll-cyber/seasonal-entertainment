#!/bin/bash
# ============================================================
# File:        prepare-ufw.sh
# Path:        deploy/test/prepare-ufw.sh
# Project:     Seasonal Entertainment
# Description: Turns on ufw in the test server with rules a server in use may already have
#              (deploy/test/run.sh): `prepare-ufw.sh nginx|jammy`. "nginx": a combined
#              80,443/tcp rule (as on the first real deployment, 2026-11-01), a port without
#              protocol (7881), a wider UDP range (50000:60000) and a rule for IPv4 only
#              (5349/tcp). "jammy": the app profile "Nginx Full" (80,443/tcp; written here, as
#              the nginx package would). Records ufw's rules, which checks.sh compares after
#              every installer step: the installer may add only what none of them covers.
# ============================================================

set -euo pipefail

ufw allow 22/tcp >/dev/null
case "$1" in
  nginx)
    ufw allow 80,443/tcp >/dev/null
    ufw allow 7881 >/dev/null
    ufw allow 50000:60000/udp >/dev/null
    ufw allow to 0.0.0.0/0 port 5349 proto tcp >/dev/null
    ;;
  jammy)
    install -d -m 755 /etc/ufw/applications.d
    printf '[Nginx Full]\ntitle=Web Server (Nginx, HTTP + HTTPS)\ndescription=test profile\nports=80,443/tcp\n' \
      >/etc/ufw/applications.d/nginx
    ufw allow 'Nginx Full' >/dev/null
    ;;
  *)
    echo "usage: prepare-ufw.sh nginx|jammy" >&2
    exit 1
    ;;
esac
ufw --force enable >/dev/null
/etc/seasonal-test/checks.sh ufw-rules >/etc/seasonal-test/ufw-before
echo "[test] ufw active with: $(ufw show added | tail -n +2 | sed 's/^ufw allow //' | paste -sd ',' | sed 's/,/, /g')"
