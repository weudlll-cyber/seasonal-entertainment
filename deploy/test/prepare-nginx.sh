#!/bin/bash
# ============================================================
# File:        prepare-nginx.sh
# Path:        deploy/test/prepare-nginx.sh
# Project:     Seasonal Entertainment
# Description: Turns the test server into one that already serves another site (the "nginx"
#              scenario of the installer tests, deploy/test/run.sh): nginx with "other.example"
#              on 80 and 443 under its own certificate and without a default_server for 443, so
#              nginx answers requests by IP address or without SNI with the first 443 server it
#              loads. As on the first real deployment (2026-11-01), the other site's file name
#              sorts after the installer's old file names (seasonal-*.conf), so an installer
#              whose files load first would take those requests over. Records the other site's
#              certificate fingerprint and the answer for unknown names, which checks.sh
#              compares after every installer step.
# ============================================================

set -euo pipefail

apt-get update -qq
apt-get install -y -qq --no-install-recommends nginx openssl curl >/dev/null

install -d -m 755 /etc/ssl/other /var/www/other
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=other.example \
  -addext subjectAltName=DNS:other.example \
  -keyout /etc/ssl/other/key.pem -out /etc/ssl/other/cert.pem 2>/dev/null
echo "the other site" >/var/www/other/index.html
cat >/etc/nginx/sites-available/site-other.example <<'CONF'
server {
    listen 80;
    server_name other.example;
    root /var/www/other;
}
server {
    listen 443 ssl;
    server_name other.example;
    ssl_certificate /etc/ssl/other/cert.pem;
    ssl_certificate_key /etc/ssl/other/key.pem;
    root /var/www/other;
}
CONF
ln -sfn /etc/nginx/sites-available/site-other.example /etc/nginx/sites-enabled/site-other.example
nginx -t 2>/dev/null
systemctl reload nginx

/etc/seasonal-test/checks.sh other-fingerprint >/etc/seasonal-test/other-fingerprint
/etc/seasonal-test/checks.sh unknown-name-answer >/etc/seasonal-test/unknown-name-answer
echo "[test] nginx serves other.example (file site-other.example, no default_server for 443)"
sed 's/^/[test]   unknown names: /' /etc/seasonal-test/unknown-name-answer
