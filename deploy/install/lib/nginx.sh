# shellcheck shell=bash
# ============================================================
# File:        nginx.sh
# Path:        deploy/install/lib/nginx.sh
# Project:     Seasonal Entertainment
# Description: nginx mode (docs/DEPLOYMENT.md, "The two modes"): the installer's own server
#              files seasonal-site.conf and seasonal-calls.conf (never an existing file), always
#              checked with nginx -t before a reload (never a restart; a failed check puts the
#              previous file back). First only port 80 (redirect, and the folder certbot proves
#              the names with), then, once certbot has the certificates (webroot: certbot never
#              edits nginx), the TLS servers forwarding to the site on 127.0.0.1 and to the call
#              service on 127.0.0.1:7880, WebSockets included.
# ============================================================

ACME_WEBROOT=/var/www/seasonal-acme
CERT_LIVE=/etc/letsencrypt/live
CERTBOT_HOOK=/etc/letsencrypt/renewal-hooks/deploy/seasonal.sh

nginx_conf_path() {
  if [[ "$NGINX_CONF_STYLE" == sites ]]; then
    echo "/etc/nginx/sites-available/seasonal-$1.conf"
  else
    echo "/etc/nginx/conf.d/seasonal-$1.conf"
  fi
}

# nginx_install_conf NAME: puts the server file from stdin in place, nginx -t, reload; when the
# check fails the earlier version (or none) comes back and the run stops.
nginx_install_conf() {
  local name="$1" path link backup=""
  path="$(nginx_conf_path "$name")"
  [[ -f "$path" ]] && backup="$(mktemp)" && cp -p "$path" "$backup"
  cat >"$path.new"
  chmod 644 "$path.new"
  mv "$path.new" "$path"
  if [[ "$NGINX_CONF_STYLE" == sites ]]; then
    link="/etc/nginx/sites-enabled/seasonal-$name.conf"
    ln -sfn "$path" "$link"
  fi
  if ! nginx -t >/dev/null 2>&1; then
    if [[ -n "$backup" ]]; then mv "$backup" "$path"; else rm -f "$path" "${link:-}"; fi
    nginx -t >/dev/null 2>&1 && systemctl reload nginx
    die "nginx rejected seasonal-$name.conf (nginx -t); the earlier state is back"
  fi
  [[ -z "$backup" ]] || rm -f "$backup"
  systemctl reload nginx || die "nginx reload failed"
  say "nginx: seasonal-$name.conf in place (nginx -t passed, reloaded)"
}

# The listen lines of one server: IPv4, and IPv6 when the server speaks it.
listen_lines() {
  local port="$1" extra="${2:-}"
  echo "    listen $port$extra;"
  has_ipv6 && echo "    listen [::]:$port$extra;"
}

# Port 80 for a set of names: the ACME folder, everything else to https://<first name>.
nginx_http_server() {
  local target="$1"
  shift
  echo "server {"
  listen_lines 80
  echo "    server_name $*;"
  echo "    location /.well-known/acme-challenge/ { root $ACME_WEBROOT; }"
  echo "    location / { return 301 https://$target\$request_uri; }"
  echo "}"
}

# The proxy headers the site needs: it trusts exactly one proxy (TRUST_PROXY=1), so nginx sets
# the visitor's address itself, replacing whatever the visitor sent.
proxy_headers() {
  cat <<'EOF'
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP $remote_addr;
EOF
}

websocket_headers() {
  cat <<'EOF'
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
EOF
}

# No "http2" on the listen line: before nginx 1.25 it would switch HTTP/2 on for every site
# sharing the address, other people's sites included; "http2 on;" does not exist before 1.25.
tls_lines() {
  listen_lines 443 " ssl"
  echo "    ssl_certificate     $CERT_LIVE/$1/fullchain.pem;"
  echo "    ssl_certificate_key $CERT_LIVE/$1/privkey.pem;"
  echo "    ssl_protocols TLSv1.2 TLSv1.3;"
}

site_names() {
  if [[ "${WWW_REDIRECT:-no}" == yes ]]; then echo "$SITE_DOMAIN www.$SITE_DOMAIN"; else echo "$SITE_DOMAIN"; fi
}

# The site's server file; with_tls=no: only port 80 (before the certificate exists).
nginx_site_conf() {
  local with_tls="$1"
  echo "# Written by deploy/install.sh (Seasonal Entertainment): do not edit; run it again instead."
  # shellcheck disable=SC2046 # the names are separate words on purpose
  nginx_http_server "$SITE_DOMAIN" $(site_names)
  [[ "$with_tls" == yes ]] || return 0
  if [[ "${WWW_REDIRECT:-no}" == yes ]]; then
    echo "server {"
    tls_lines seasonal-site
    echo "    server_name www.$SITE_DOMAIN;"
    echo "    return 301 https://$SITE_DOMAIN\$request_uri;"
    echo "}"
  fi
  echo "server {"
  tls_lines seasonal-site
  echo "    server_name $SITE_DOMAIN;"
  echo "    # Uploads: 25 MB at most (the \"Largest file\" setting's bound), plus encryption overhead."
  echo "    client_max_body_size 30m;"
  echo "    location / {"
  echo "        proxy_pass http://127.0.0.1:$SITE_LOCAL_PORT;"
  proxy_headers
  echo "    }"
  echo "    # The chat's live connection."
  echo "    location = /ws/chat {"
  echo "        proxy_pass http://127.0.0.1:$SITE_LOCAL_PORT;"
  proxy_headers
  websocket_headers
  echo "    }"
  echo "}"
}

nginx_calls_conf() {
  local with_tls="$1"
  echo "# Written by deploy/install.sh (Seasonal Entertainment): do not edit; run it again instead."
  nginx_http_server "$CALLS_DOMAIN" "$CALLS_DOMAIN"
  [[ "$with_tls" == yes ]] || return 0
  echo "server {"
  tls_lines seasonal-calls
  echo "    server_name $CALLS_DOMAIN;"
  echo "    # LiveKit's signalling (port 7880, closed to the outside by the firewall)."
  echo "    location / {"
  echo "        proxy_pass http://127.0.0.1:7880;"
  proxy_headers
  websocket_headers
  echo "    }"
  echo "}"
}

# certbot for one certificate name (seasonal-site, seasonal-calls), by webroot: certbot only
# writes the challenge file; renewals come from certbot's own timer.
certbot_cert() {
  local name="$1" args=()
  shift
  local domain
  for domain in "$@"; do args+=(-d "$domain"); done
  [[ -z "${ACME_SERVER:-}" ]] || args+=(--server "$ACME_SERVER")
  say "certbot: certificate $name for $*"
  REQUESTS_CA_BUNDLE="${ACME_CA_BUNDLE:-}" certbot certonly --webroot -w "$ACME_WEBROOT" \
    --cert-name "$name" "${args[@]}" --email "$ACME_EMAIL" --agree-tos --non-interactive \
    --keep-until-expiring --quiet ||
    die "certbot could not get the certificate for $* (DNS A records pointing here? port 80 open?)"
}

# The deploy hook: after a renewal, nginx reloads; the calls certificate goes to LiveKit too.
install_certbot_hook() {
  install -d -m 755 "$(dirname "$CERTBOT_HOOK")"
  install -m 755 "$INSTALL_DIR/deploy/install/certbot-hook.sh" "$CERTBOT_HOOK"
}

nginx_check_names() {
  local name owner
  # shellcheck disable=SC2046
  for name in $(site_names) ${CALLS_DOMAIN:-}; do
    owner="$(nginx_name_taken "$name")"
    [[ -z "$owner" ]] || die "nginx already serves $name in $owner: the installer never edits that file; nothing was changed"
  done
}

setup_nginx() {
  detect_nginx_style
  nginx_check_names
  install -d -m 755 "$ACME_WEBROOT"
  nginx_site_conf no | nginx_install_conf site
  [[ -z "${CALLS_DOMAIN:-}" ]] || nginx_calls_conf no | nginx_install_conf calls
  ensure_certbot
  # shellcheck disable=SC2046
  certbot_cert seasonal-site $(site_names)
  [[ -z "${CALLS_DOMAIN:-}" ]] || certbot_cert seasonal-calls "$CALLS_DOMAIN"
  install_certbot_hook
  nginx_site_conf yes | nginx_install_conf site
  [[ -z "${CALLS_DOMAIN:-}" ]] || nginx_calls_conf yes | nginx_install_conf calls
}

remove_nginx_files() {
  local name path removed=no
  detect_nginx_style
  for name in site calls; do
    for path in "$(nginx_conf_path "$name")" "/etc/nginx/sites-enabled/seasonal-$name.conf"; do
      [[ -e "$path" || -L "$path" ]] && rm -f "$path" && removed=yes
    done
  done
  if [[ "$removed" == yes ]]; then
    nginx -t >/dev/null 2>&1 || die "nginx -t fails after removing the installer's files"
    systemctl reload nginx
    say "nginx: the installer's server files removed (nginx -t passed, reloaded)"
  fi
  rm -f "$CERTBOT_HOOK"
}
