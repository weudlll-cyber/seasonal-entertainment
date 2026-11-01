#!/bin/bash
# ============================================================
# File:        prepare-nginx.sh
# Path:        deploy/test/prepare-nginx.sh
# Project:     Seasonal Entertainment
# Description: Turns the test server into one that already serves another site (mode b of the
#              installer tests, deploy/test/run.sh): nginx with "other.example" on 80 and 443
#              under its own certificate, and ufw active with 22, 80 and 443 allowed, as on a
#              server that has been in use. Records the other site's certificate fingerprint,
#              which checks.sh compares after every installer step.
# ============================================================

set -euo pipefail

apt-get update -qq
apt-get install -y -qq --no-install-recommends nginx openssl curl >/dev/null

install -d -m 755 /etc/ssl/other /var/www/other
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=other.example \
  -addext subjectAltName=DNS:other.example \
  -keyout /etc/ssl/other/key.pem -out /etc/ssl/other/cert.pem 2>/dev/null
echo "the other site" >/var/www/other/index.html
cat >/etc/nginx/sites-available/other.example <<'EOF'
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
EOF
ln -sfn /etc/nginx/sites-available/other.example /etc/nginx/sites-enabled/other.example
nginx -t 2>/dev/null
systemctl reload nginx

for rule in 22/tcp 80/tcp 443/tcp; do ufw allow "$rule" >/dev/null; done
ufw --force enable >/dev/null

/etc/seasonal-test/checks.sh other-fingerprint >/etc/seasonal-test/other-fingerprint
echo "[test] nginx serves other.example; ufw active with 22, 80, 443"
