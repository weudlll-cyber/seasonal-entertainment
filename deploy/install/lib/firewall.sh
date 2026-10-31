# shellcheck shell=bash
# ============================================================
# File:        firewall.sh
# Path:        deploy/install/lib/firewall.sh
# Project:     Seasonal Entertainment
# Description: The firewall, touched as little as possible: with ufw active, only the rules the
#              chosen features need are added, and a rule ufw already had is not counted as the
#              installer's (no comment is added: with one, ufw would "update" an existing rule
#              instead of skipping it, and --uninstall would remove it); the ones it added are listed
#              in /etc/seasonal/ufw-added, so --uninstall removes exactly those. With ufw
#              inactive or absent nothing is enabled: the ports to open are printed instead.
#              Existing rules are never changed.
# ============================================================

UFW_ADDED="$STATE_DIR/ufw-added"

# The ports the features need, as ufw specs.
needed_ports() {
  echo 80/tcp
  echo 443/tcp
  [[ "$MODE" == caddy ]] && echo 443/udp # HTTP/3 through Caddy
  if [[ -n "${CALLS_DOMAIN:-}" ]]; then
    echo 7881/tcp        # call media over TCP
    echo 3478/udp        # TURN over UDP
    echo 5349/tcp        # TURN over TLS
    echo 50000:50499/udp # call media (250 participants)
  fi
}

ufw_active() { command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; }

open_ports() {
  local spec out
  if ! ufw_active; then
    say "firewall: ufw is not active, so nothing was changed. These ports must be open (here or in your provider's firewall): $(needed_ports | tr '\n' ' ')"
    return 0
  fi
  install -d -m 700 "$STATE_DIR"
  touch "$UFW_ADDED"
  while read -r spec; do
    out="$(ufw allow "$spec" 2>&1)" || die "ufw allow $spec failed: $out"
    if [[ "$out" == *Skipping* ]]; then
      say "firewall: $spec already allowed (left as it was)"
    else
      grep -qxF "$spec" "$UFW_ADDED" || echo "$spec" >>"$UFW_ADDED"
      say "firewall: allowed $spec"
    fi
  done < <(needed_ports)
  say "firewall: a provider firewall in front of the server (if any) needs the same ports: $(needed_ports | tr '\n' ' ')"
}

# --uninstall: exactly the rules this installer added.
close_ports() {
  local spec
  [[ -f "$UFW_ADDED" ]] || return 0
  if ufw_active; then
    while read -r spec; do
      [[ -n "$spec" ]] || continue
      ufw delete allow "$spec" >/dev/null 2>&1 && say "firewall: removed $spec"
    done <"$UFW_ADDED"
  fi
  rm -f "$UFW_ADDED"
}
