#!/bin/bash
# ============================================================
# File:        checks.sh
# Path:        deploy/test/checks.sh
# Project:     Seasonal Entertainment
# Description: The installer tests' checks, run inside the test server by deploy/test/run.sh:
#              `checks.sh <check> [args]`. Each prints one "[check] PASS|FAIL <name>" line and
#              fails with a non-zero exit. Certificates are checked against Pebble's root, so a
#              pass means a real ACME certificate, not just any answer. Secrets are read from
#              the server's files where needed but never printed (only their hashes).
# ============================================================

set -euo pipefail

SITE_DIR=/opt/seasonal-entertainment/deploy/site
TEST_DIR=/etc/seasonal-test
ROOT_CA="$TEST_DIR/pebble-root.pem"

pass() { echo "[check] PASS $1"; }
fail() {
  echo "[check] FAIL $1: $2"
  exit 1
}

# Pebble makes a new root on every start: fetched over its management port, trusted via minica.
pebble_root() {
  [[ -s "$ROOT_CA" ]] || curl -fsS --cacert "$TEST_DIR/pebble.minica.pem" https://pebble:15000/roots/0 >"$ROOT_CA"
}

kv() { sed -n "s/^$2=//p" "$1" | tail -n 1; }

check="$1"
shift
case "$check" in
  health)
    pebble_root
    answer="$(curl -fsS --max-time 10 --cacert "$ROOT_CA" https://example.org/api/health)" ||
      fail health "no answer with a certificate from Pebble"
    [[ "$answer" == *'"ok":true'* ]] || fail health "$answer"
    pass "health over https with a Pebble certificate: $answer"
    ;;
  www)
    pebble_root
    read -r code location < <(curl -sS -o /dev/null --max-time 10 --cacert "$ROOT_CA" \
      -w '%{http_code} %{redirect_url}\n' https://www.example.org/abc)
    [[ "$code" == 30[18] && "$location" == https://example.org/abc ]] || fail www "$code $location"
    pass "www redirects ($code to $location)"
    ;;
  other-fingerprint)
    # The other site's certificate as served on 443 for its own name.
    openssl s_client -connect 127.0.0.1:443 -servername other.example </dev/null 2>/dev/null |
      openssl x509 -noout -fingerprint -sha256
    ;;
  other)
    now="$("$0" other-fingerprint)"
    [[ "$now" == "$(cat "$TEST_DIR/other-fingerprint")" ]] || fail other "its certificate changed: $now"
    body="$(curl -fsS -k --max-time 10 https://other.example/)" || fail other "no answer"
    [[ "$body" == "the other site" ]] || fail other "answer changed: $body"
    pass "the other nginx site answers unchanged with its own certificate"
    ;;
  wss)
    # A LiveKit token signed with the installer's key pair, then a WebSocket upgrade over TLS.
    key="$(kv "$SITE_DIR/site.env" CALLS_API_KEY)"
    secret="$(kv "$SITE_DIR/site.env" CALLS_API_SECRET)"
    b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
    now="$(date +%s)"
    header="$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)"
    payload="$(printf '{"iss":"%s","sub":"installer-test","nbf":%d,"exp":%d,"video":{"room":"t","roomJoin":true}}' \
      "$key" "$((now - 10))" "$((now + 600))" | b64url)"
    signature="$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)"
    pebble_root
    code="$(curl -sS -o /dev/null --max-time 5 --http1.1 --cacert "$ROOT_CA" -w '%{http_code}' \
      -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
      -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
      "https://calls.example.org/rtc?access_token=$header.$payload.$signature" 2>/dev/null || true)"
    [[ "$code" == 101 ]] || fail wss "the upgrade answered $code"
    pass "call signalling: wss upgrade through the proxy (101)"
    ;;
  admin)
    admins="$(docker exec -w /app seasonal-site-site-1 node --input-type=commonjs -e "
      const db = new (require('better-sqlite3'))('/data/seasonal.db', { readonly: true });
      console.log(db.prepare(\"SELECT username FROM users WHERE role = 'admin'\").all().map((u) => u.username).join(','));
    ")"
    [[ "$admins" == admin ]] || fail admin "admins in the database: '$admins'"
    [[ -z "$(kv "$SITE_DIR/site.env" BOOTSTRAP_TOKEN)" ]] || fail admin "BOOTSTRAP_TOKEN is still in site.env"
    pass "the first admin exists and BOOTSTRAP_TOKEN is gone"
    ;;
  modes)
    for file in "$SITE_DIR/site.env" "$SITE_DIR/.env" /etc/seasonal/secret-encryption-key "$@"; do
      [[ "$(stat -c %a "$file")" == 600 ]] || fail modes "$file is mode $(stat -c %a "$file")"
    done
    pass "secret files are mode 600"
    ;;
  secrets-hash)
    # One hash over the secret values: equal before and after a re-run means they were kept.
    grep -E '^(SESSION_SECRET|SECRET_ENCRYPTION_KEY|CALLS_API_SECRET)=' "$SITE_DIR/site.env" | sort | sha256sum | cut -c1-16
    ;;
  backup)
    newest="$(find /var/backups/seasonal -name '*.tar.age' -printf '%T@ %p\n' | sort -n | tail -n 1 | cut -d' ' -f2)"
    [[ -n "$newest" ]] || fail backup "no .tar.age backup"
    age -d -i "$TEST_DIR/age-key.txt" "$newest" | tar -t | grep '/seasonal.db$' >/dev/null ||
      fail backup "$newest does not decrypt to a backup with the database"
    pass "backup $newest decrypts with the age key and holds the database"
    ;;
  marker-write)
    docker exec seasonal-site-site-1 sh -c 'echo kept > /data/installer-test-marker'
    pass "marker written into the site's data"
    ;;
  marker)
    [[ "$(docker run --rm -v seasonal-site_site-data:/data alpine:3.22 cat /data/installer-test-marker 2>/dev/null)" == kept ]] ||
      fail marker "the site's data lost the marker"
    pass "the site's data is intact (marker kept)"
    ;;
  status)
    out="$(/opt/seasonal-entertainment/deploy/install.sh --status)"
    printf '  %s\n' "${out//$'\n'/$'\n'  }"
    [[ "$out" == *'health: {'* && "$out" == *'mode: '"$1"* ]] || fail status "unexpected --status"
    pass "--status shows mode $1 and a healthy site"
    ;;
  uninstalled)
    [[ -z "$(docker ps -q --filter 'name=^seasonal-')" ]] || fail uninstalled "containers still run"
    [[ ! -e /etc/nginx/sites-enabled/seasonal-site.conf && ! -e /etc/nginx/sites-available/seasonal-site.conf ]] ||
      fail uninstalled "the installer's nginx file is still there"
    [[ ! -e /etc/letsencrypt/renewal-hooks/deploy/seasonal.sh ]] || fail uninstalled "the certbot hook is still there"
    [[ -z "$(systemctl list-unit-files --no-legend 'seasonal-*' 2>/dev/null)" ]] || fail uninstalled "units remain"
    docker volume inspect seasonal-site_site-data >/dev/null || fail uninstalled "the data volume is gone"
    [[ -n "$(kv "$SITE_DIR/site.env" SESSION_SECRET)" ]] || fail uninstalled "the secrets are gone"
    pass "uninstalled: containers, nginx files, hook and units gone; data and secrets kept"
    ;;
  ufw)
    # The rules the server had before (22, 80, 443) stay; the installer's own are listed.
    rules="$(ufw status | awk 'NR > 4 && $2 == "ALLOW" { print $1 }' | sort -u | tr '\n' ' ')"
    for rule in 22/tcp 80/tcp 443/tcp "$@"; do
      [[ " $rules " == *" $rule "* ]] || fail ufw "rule $rule missing (have: $rules)"
    done
    pass "firewall rules: $rules"
    ;;
  ufw-own)
    # Only what the installer added itself: the server's own 80/443 are not counted as its.
    added="$(tr '\n' ' ' </etc/seasonal/ufw-added 2>/dev/null || true)"
    [[ "$added" == "$*"* && " $added " != *" 80/tcp "* ]] || fail ufw-own "recorded as added: $added"
    pass "firewall rules recorded as the installer's: $added"
    ;;
  containers)
    for name in "$@"; do
      [[ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" == true ]] || fail containers "$name is not running"
    done
    pass "running: $*"
    ;;
  *)
    fail "$check" "unknown check"
    ;;
esac
