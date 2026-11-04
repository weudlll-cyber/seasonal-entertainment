# shellcheck shell=bash
# ============================================================
# File:        nginx.sh
# Path:        deploy/install/lib/nginx.sh
# Project:     Seasonal Entertainment
# Description: nginx mode (docs/DEPLOYMENT.md, "The two modes"): the installer's own server
#              files zz-seasonal-site.conf and zz-seasonal-calls.conf (never an existing file;
#              the names before 2026-11-01, seasonal-site.conf and seasonal-calls.conf, are
#              moved to these), always checked with nginx -t and the load order before a reload
#              (never a restart), and the answer for unknown names compared after it
#              (nginx-default.sh); a failed check puts the previous files back. Before a
#              certificate exists, first only port 80 (redirect, and the folder certbot proves
#              the names with), then, once certbot has the certificates (webroot: certbot never
#              edits nginx), the TLS servers forwarding to the site on 127.0.0.1 and to the call
#              service on 127.0.0.1:7880, WebSockets included; the Discord callback and file
#              links logged without their query (secrets); with the event bot's admin page, its
#              locations in the site's server (bot-admin.sh).
# ============================================================

ACME_WEBROOT=/var/www/seasonal-acme
CERT_LIVE=/etc/letsencrypt/live
CERTBOT_HOOK=/etc/letsencrypt/renewal-hooks/deploy/seasonal.sh

# The installer's file for NAME (site, calls). nginx reads a folder in name order and gives
# unknown names to the first server it loaded: "zz-" puts ours after the other sites' files.
nginx_conf_path() {
  if [[ "$NGINX_CONF_STYLE" == sites ]]; then
    echo "/etc/nginx/sites-available/zz-seasonal-$1.conf"
  else
    echo "/etc/nginx/conf.d/zz-seasonal-$1.conf"
  fi
}

# Every path the installer's files may have, in every folder, under today's and the old names.
nginx_own_paths() {
  local dir name
  for dir in sites-available sites-enabled conf.d; do
    for name in site calls; do
      echo "/etc/nginx/$dir/zz-seasonal-$name.conf"
      echo "/etc/nginx/$dir/seasonal-$name.conf"
    done
  done
}

# The installer's nginx files that exist (links included).
nginx_own_files() {
  local path
  for path in $(nginx_own_paths); do
    if [[ -e "$path" || -L "$path" ]]; then echo "$path"; fi
  done
}

# A tar of the installer's files as they are now (its path is printed), for nginx_put_back.
nginx_save_own() {
  local saved
  saved="$(mktemp)"
  # shellcheck disable=SC2046 # one path per word; the paths hold no spaces
  tar -C / -cf "$saved" --files-from /dev/null $(nginx_own_files | sed 's|^/||')
  echo "$saved"
}

# nginx_put_back SAVED: the installer's files as nginx_save_own saved them, then nginx reloaded
# if it accepts them.
nginx_put_back() {
  # shellcheck disable=SC2046
  rm -f $(nginx_own_paths)
  tar -C / -xf "$1"
  rm -f "$1"
  if nginx -t >/dev/null 2>&1; then systemctl reload nginx; fi
}

# nginx_commit WHAT SAVED: after a change to the installer's files, nginx -t and the load order
# (nginx-default.sh), the reload, then the answer for unknown names; when a check fails the
# files saved before the change come back and the run stops.
nginx_commit() {
  local what="$1" saved="$2" problem
  if ! nginx -t >/dev/null 2>&1; then
    nginx_put_back "$saved"
    die "nginx rejected $what (nginx -t); the earlier state is back"
  fi
  problem="$(nginx_order_problems | tr '\n' ' ')"
  if [[ -n "$problem" ]]; then
    nginx_put_back "$saved"
    die "with $what a server of the installer's would load before the other sites' servers on $problem(another file sorts after zz-seasonal-*.conf), so nginx would answer requests by IP address with it. Mark the server that should answer them \"listen ... default_server\" in your own file, then run the installer again; the earlier state is back"
  fi
  systemctl reload nginx || die "nginx reload failed"
  if problem="$(nginx_default_changed)"; then
    nginx_put_back "$saved"
    die "after the reload with $what nginx answered requests without a known name (by IP address, no SNI) differently ($problem); the earlier state is back"
  fi
  rm -f "$saved"
}

# nginx_place NAME FILE: FILE becomes the installer's file for NAME under today's name; the old
# name and its link go.
nginx_place() {
  local name="$1" file="$2" path
  path="$(nginx_conf_path "$name")"
  chmod 644 "$file"
  rm -f "/etc/nginx/sites-enabled/seasonal-$name.conf" "/etc/nginx/sites-available/seasonal-$name.conf" \
    "/etc/nginx/conf.d/seasonal-$name.conf"
  mv "$file" "$path"
  [[ "$NGINX_CONF_STYLE" != sites ]] || ln -sfn "$path" "/etc/nginx/sites-enabled/zz-seasonal-$name.conf"
}

# Files from before 2026-11-01 (seasonal-*.conf) get today's names, all in one step: with only
# one of them moved, the other would still load before the other sites' files.
nginx_migrate_names() {
  local name old saved moved=""
  saved="$(nginx_save_own)"
  for name in site calls; do
    for old in "/etc/nginx/sites-available/seasonal-$name.conf" "/etc/nginx/conf.d/seasonal-$name.conf"; do
      [[ -f "$old" ]] || continue
      mv "$old" "$old.move"
      nginx_place "$name" "$old.move"
      moved+=" seasonal-$name.conf"
    done
  done
  if [[ -z "$moved" ]]; then
    rm -f "$saved"
    return 0
  fi
  nginx_commit "the new file names" "$saved"
  say "nginx:$moved renamed to zz-seasonal-*.conf (they now load after the other sites' files)"
}

# nginx_install_conf NAME: puts the server file from stdin in place, checked by nginx_commit.
nginx_install_conf() {
  local name="$1" saved new
  saved="$(nginx_save_own)"
  new="$(nginx_conf_path "$name").new"
  cat >"$new"
  nginx_place "$name" "$new"
  nginx_commit "zz-seasonal-$name.conf" "$saved"
  say "nginx: zz-seasonal-$name.conf in place (nginx -t passed, load order and the answer for unknown names unchanged, reloaded)"
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
  nginx_reject_servers
  if [[ "${WWW_REDIRECT:-no}" == yes ]]; then
    echo "server {"
    tls_lines seasonal-site
    echo "    server_name www.$SITE_DOMAIN;"
    echo "    return 301 https://$SITE_DOMAIN\$request_uri;"
    echo "}"
  fi
  nginx_no_query_log_format
  echo "server {"
  tls_lines seasonal-site
  echo "    server_name $SITE_DOMAIN;"
  echo "    # Uploads: 25 MB at most (the \"Largest file\" setting's bound), plus encryption overhead."
  echo "    client_max_body_size 30m;"
  echo "    location / {"
  echo "        proxy_pass http://127.0.0.1:$SITE_LOCAL_PORT;"
  proxy_headers
  echo "    }"
  nginx_no_query_locations
  echo "    # The chat's live connection."
  echo "    location = /ws/chat {"
  echo "        proxy_pass http://127.0.0.1:$SITE_LOCAL_PORT;"
  proxy_headers
  websocket_headers
  echo "    }"
  ! bot_admin_on || nginx_bot_admin_locations
  echo "}"
}

# Two kinds of request carry a secret in the query: Discord's one-time code and state on the
# callback, and a file link's signature (?link=, valid 5 minutes). They are logged without the
# query; every other request is logged as before. The format is the distributions' "combined"
# with the path in place of the whole request line, written where they log by default.
NO_QUERY_LOG=/var/log/nginx/access.log
nginx_no_query_log_format() {
  echo "log_format seasonal_no_query '\$remote_addr - \$remote_user [\$time_local] \"\$request_method \$uri \$server_protocol\" \$status \$body_bytes_sent \"\$http_referer\" \"\$http_user_agent\"';"
}
nginx_no_query_locations() {
  local path
  echo "    # Logged without the query (Discord's code and state, a file link's signature)."
  for path in "= /api/auth/discord/callback" "/api/chat/files/"; do
    echo "    location $path {"
    echo "        proxy_pass http://127.0.0.1:$SITE_LOCAL_PORT;"
    proxy_headers
    echo "        access_log $NO_QUERY_LOG seasonal_no_query;"
    echo "    }"
  done
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
  run_step "certbot for $*" env REQUESTS_CA_BUNDLE="${ACME_CA_BUNDLE:-}" certbot certonly \
    --webroot -w "$ACME_WEBROOT" --cert-name "$name" "${args[@]}" --email "$ACME_EMAIL" \
    --agree-tos --non-interactive --keep-until-expiring ||
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
  # Before anything changes: what unknown names get now, and where a server of ours must
  # reject them (nginx-default.sh).
  nginx_record_default
  nginx_plan_default
  nginx_migrate_names
  # The token include before a file of ours names it (nginx -t would fail without it).
  bot_admin_before_nginx
  install -d -m 755 "$ACME_WEBROOT"
  # Port 80 alone only before a certificate exists: on a re-run the TLS servers stay in place,
  # so the site never loses HTTPS and the answer for unknown names never changes in between.
  [[ -f "$CERT_LIVE/seasonal-site/fullchain.pem" ]] || nginx_site_conf no | nginx_install_conf site
  [[ -z "${CALLS_DOMAIN:-}" || -f "$CERT_LIVE/seasonal-calls/fullchain.pem" ]] ||
    nginx_calls_conf no | nginx_install_conf calls
  ensure_certbot
  # shellcheck disable=SC2046
  certbot_cert seasonal-site $(site_names)
  [[ -z "${CALLS_DOMAIN:-}" ]] || certbot_cert seasonal-calls "$CALLS_DOMAIN"
  install_certbot_hook
  nginx_site_conf yes | nginx_install_conf site
  [[ -z "${CALLS_DOMAIN:-}" ]] || nginx_calls_conf yes | nginx_install_conf calls
  bot_admin_after_nginx
}

remove_nginx_files() {
  local path removed=no
  for path in $(nginx_own_files); do
    rm -f "$path"
    removed=yes
  done
  if [[ "$removed" == yes ]]; then
    nginx -t >/dev/null 2>&1 || die "nginx -t fails after removing the installer's files"
    systemctl reload nginx
    say "nginx: the installer's server files removed (nginx -t passed, reloaded)"
  fi
  rm -f "$CERTBOT_HOOK"
}
