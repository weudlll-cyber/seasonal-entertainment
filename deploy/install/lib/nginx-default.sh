# shellcheck shell=bash
# ============================================================
# File:        nginx-default.sh
# Path:        deploy/install/lib/nginx-default.sh
# Project:     Seasonal Entertainment
# Description: nginx mode (docs/DEPLOYMENT.md, "Unknown names stay with the other sites"): the
#              installer must not change which server answers requests on 443 for a name nginx
#              does not know (by IP address, or without SNI). nginx gives them to the
#              default_server of the address, else to the first server it loaded that listens
#              there. So: another site's default_server stays it; otherwise the installer's
#              files are named to load last (nginx.sh) and checked to come after the other
#              sites' servers before a reload; where no other site listens on 443, a server of
#              ours rejects the TLS handshake for unknown names (nginx 1.19.4 or newer). After
#              every reload the certificate shown without SNI is compared with the one before
#              the run; when it changed, nginx.sh puts its files back and the run stops.
# ============================================================

# The installer's nginx files, by their full path: today's names and the names before
# 2026-11-01 (seasonal-site.conf, seasonal-calls.conf), which loaded before other sites' files.
NGINX_OWN_FILE_RE='/(zz-)?seasonal-(site|calls)[.]conf$'

# The listen directives nginx has loaded, in load order (nginx -T prints the files in the
# order it reads them): "<file> <ipv4|ipv6>:<port> <default|->". Only listens on all addresses
# of a family count (the installer's own kind); one address, a unix socket or QUIC is left out.
nginx_listens() {
  nginx -T 2>/dev/null | awk '
    /^# configuration file / { file = $4; sub(/:$/, "", file); next }
    {
      sub(/#.*/, "")
      # Directives end at ";", blocks open and close with braces: one line may hold several.
      count = split($0, statements, /[{};]/)
      for (s = 1; s <= count; s++) {
        n = split(statements[s], f, " ")
        if (f[1] != "listen") continue
        addr = f[2]; family = ""; port = addr; flag = "-"
        if (addr ~ /^[0-9]+$/) family = "ipv4"
        else if (addr ~ /^(\*|0\.0\.0\.0):[0-9]+$/) { family = "ipv4"; sub(/.*:/, "", port) }
        else if (addr ~ /^\[::\]:[0-9]+$/) { family = "ipv6"; sub(/.*:/, "", port) }
        for (i = 3; i <= n; i++) {
          if (f[i] == "quic") family = ""
          if (f[i] == "default_server" || f[i] == "default") flag = "default"
        }
        if (family != "") print file, family ":" port, flag
      }
    }'
}

# The family:port pairs where a server of ours is the first nginx loaded, so its default for
# unknown names, although another site listens there too without a default_server.
nginx_order_problems() {
  nginx_listens | awk -v own="$NGINX_OWN_FILE_RE" '
    { mine = ($1 ~ own) }
    !($2 in first) { first[$2] = mine }
    !mine { other[$2] = 1; if ($3 == "default") other_default[$2] = 1 }
    END { for (key in first) if (first[key] && other[key] && !other_default[key]) print key }'
}

# The families (ipv4, ipv6) where some other site's server listens on 443.
nginx_443_families_taken() {
  nginx_listens | awk -v own="$NGINX_OWN_FILE_RE" '$1 !~ own && $2 ~ /:443$/ { sub(/:.*/, "", $2); print $2 }' | sort -u
}

# ssl_reject_handshake exists from nginx 1.19.4 (Ubuntu 22.04 ships 1.18, 24.04 1.24).
nginx_rejects_handshakes() {
  local version
  version="$(nginx -v 2>&1 | sed -n 's|.*nginx/\([0-9.]*\).*|\1|p')"
  [[ "$(printf '%s\n' 1.19.4 "$version" | sort -V | head -n 1)" == 1.19.4 ]]
}

# Sets NGINX_REJECT_FAMILIES: the families the installer listens on where no other site listens
# on 443. Before the run nothing answered TLS there; a server that rejects the handshake keeps
# it that way for unknown names. Without ssl_reject_handshake (nginx 1.18) there is no such
# server: the site's own server becomes the default there (docs/DEPLOYMENT.md).
nginx_plan_default() {
  local taken family
  NGINX_REJECT_FAMILIES=""
  taken="$(nginx_443_families_taken)"
  for family in ipv4 $(has_ipv6 && echo ipv6); do
    [[ "$taken" == *"$family"* ]] && continue
    if nginx_rejects_handshakes; then
      NGINX_REJECT_FAMILIES+=" $family"
    else
      warn "no other site listens on 443 ($family) and nginx is older than 1.19.4: requests by IP address get the site's certificate there"
    fi
  done
}

# The servers of ours that reject the TLS handshake for unknown names (nginx_plan_default).
nginx_reject_servers() {
  local family
  for family in ${NGINX_REJECT_FAMILIES:-}; do
    echo "# Unknown names on 443 ($family; by IP address, no SNI): no TLS answer, as before the install."
    echo "server {"
    if [[ "$family" == ipv4 ]]; then echo "    listen 443 ssl default_server;"; else echo "    listen [::]:443 ssl default_server;"; fi
    echo "    ssl_reject_handshake on;"
    echo "}"
  done
}

# The certificate nginx shows on 443 to a client that names no server, as a SHA-256
# fingerprint; empty when there is no TLS answer (nothing listens, or the handshake is rejected).
no_sni_answer() {
  timeout 10 openssl s_client -connect "$1:443" -noservername </dev/null 2>/dev/null |
    openssl x509 -noout -fingerprint -sha256 2>/dev/null || true
}

no_sni_addresses() {
  echo 127.0.0.1
  has_ipv6 && echo '[::1]'
}

# The no-SNI answers before the run changes nginx, one "address fingerprint" line each.
nginx_record_default() {
  local address
  NGINX_DEFAULT_BEFORE="$(for address in $(no_sni_addresses); do echo "$address $(no_sni_answer "$address")"; done)"
}

# true when a fingerprint is one of the installer's own certificates.
own_certificate() {
  local file
  [[ -n "$1" ]] || return 1
  for file in "$CERT_LIVE"/seasonal-*/cert.pem; do
    [[ -f "$file" ]] || continue
    [[ "$(openssl x509 -in "$file" -noout -fingerprint -sha256)" == "$1" ]] && return 0
  done
  return 1
}

# After a reload: true, printing what changed, when unknown names get another answer than
# before the run.
nginx_default_changed() {
  local address before now changed=1
  while read -r address before; do
    [[ -n "$address" ]] || continue
    now="$(no_sni_answer "$address")"
    [[ "$now" == "$before" ]] && continue
    # An earlier version of the installer had made its own file the default: the load-order
    # check has already made sure the answer is no longer ours where other sites listen.
    own_certificate "$before" && continue
    # Nothing answered TLS there before and nginx cannot reject a handshake (nginx_plan_default).
    [[ -z "$before" ]] && ! nginx_rejects_handshakes && continue
    echo "$address: ${before:-no TLS answer} before, now ${now:-no TLS answer}"
    changed=0
  done <<<"$NGINX_DEFAULT_BEFORE"
  return "$changed"
}
