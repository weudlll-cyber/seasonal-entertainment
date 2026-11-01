# shellcheck shell=bash
# ============================================================
# File:        firewall.sh
# Path:        deploy/install/lib/firewall.sh
# Project:     Seasonal Entertainment
# Description: The firewall, touched as little as possible: with ufw active, only the rules the
#              chosen features need and no existing rule allows yet are added. An existing rule
#              counts when it lets the port in from anywhere, also as part of a combined rule
#              (80,443/tcp), a range (50000:60000/udp), a port without protocol, or an app
#              profile (Nginx Full), for IPv4 and IPv6 separately: when only one of them is
#              missing, only that one is added. The rules added are listed in
#              /etc/seasonal/ufw-added (no ufw comment: with one, ufw would "update" an existing
#              rule instead of skipping it), so --uninstall removes exactly those. With ufw
#              inactive or absent nothing is enabled: the ports to open are printed instead.
#              Existing rules are never changed.
# ============================================================

UFW_ADDED="$STATE_DIR/ufw-added"
UFW_RULES_V4=/etc/ufw/user.rules
UFW_RULES_V6=/etc/ufw/user6.rules

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

# ufw adds every rule for IPv6 too, unless IPv6 is switched off in its settings.
ufw_ipv6() { grep -qi '^IPV6=yes' /etc/default/ufw 2>/dev/null; }

# ufw_covers RULES_FILE PROTO PORT: an existing rule already lets PROTO (tcp/udp) to PORT (a
# port, or a range A:B) in, from any address to any address, on every interface. ufw keeps each
# rule as a "### tuple ###" line: action, protocol, ports, destination, source port, source,
# [app names,] direction; an app profile's ports are already resolved there. A rule limited
# to a source, an interface or a rate (limit) does not count: it does not open the port.
ufw_covers() {
  local file="$1" proto="$2" want="$3"
  [[ -f "$file" ]] || return 1
  awk -v proto="$proto" -v want="$want" '
    BEGIN { lo = want; hi = want; if (split(want, w, ":") == 2) { lo = w[1]; hi = w[2] } }
    $1 == "###" && $2 == "tuple" && $3 == "###" && $4 == "allow" && $NF == "in" &&
    ($5 == proto || $5 == "any") && $8 == "any" &&
    ($7 == "0.0.0.0/0" || $7 == "::/0") && ($9 == "0.0.0.0/0" || $9 == "::/0") {
      if ($6 == "any") found = 1
      n = split($6, items, ",")
      for (i = 1; i <= n; i++) {
        a = items[i]; b = items[i]
        if (split(items[i], r, ":") == 2) { a = r[1]; b = r[2] }
        if (lo + 0 >= a + 0 && hi + 0 <= b + 0) found = 1
      }
    }
    END { exit !found }' "$file"
}

# The ufw rule to add for one spec (port/proto), or nothing when existing rules cover it:
# the plain spec, or only the address family that is still missing.
ufw_rule_needed() {
  local spec="$1" port proto v4=yes v6=yes
  port="${spec%/*}"
  proto="${spec#*/}"
  ufw_covers "$UFW_RULES_V4" "$proto" "$port" || v4=no
  if ufw_ipv6; then ufw_covers "$UFW_RULES_V6" "$proto" "$port" || v6=no; fi
  case "$v4$v6" in
    nono) echo "$spec" ;;
    noyes) echo "to 0.0.0.0/0 port $port proto $proto" ;;
    yesno) echo "to ::/0 port $port proto $proto" ;;
  esac
}

open_ports() {
  local spec rule out args=()
  if ! ufw_active; then
    say "firewall: ufw is not active, so nothing was changed. These ports must be open (here or in your provider's firewall): $(needed_ports | tr '\n' ' ')"
    return 0
  fi
  install -d -m 700 "$STATE_DIR"
  touch "$UFW_ADDED"
  while read -r spec; do
    rule="$(ufw_rule_needed "$spec")"
    if [[ -z "$rule" ]]; then
      say "firewall: $spec already allowed by an existing rule (left as it is)"
      continue
    fi
    read -ra args <<<"$rule"
    out="$(ufw allow "${args[@]}" 2>&1)" || die "ufw allow $rule failed: $out"
    # Only a rule ufw really added is the installer's ("Skipping": it existed after all).
    if [[ "$out" == *'Rule added'* || "$out" == *'Rules updated'* ]]; then
      grep -qxF "$rule" "$UFW_ADDED" || echo "$rule" >>"$UFW_ADDED"
      say "firewall: allowed $rule"
    else
      say "firewall: $spec already allowed (left as it is)"
    fi
  done < <(needed_ports)
  say "firewall: a provider firewall in front of the server (if any) needs the same ports: $(needed_ports | tr '\n' ' ')"
}

# ufw_delete RULE: removes one rule the installer recorded (a spec or a "to ... port ..." rule).
ufw_delete() {
  local args=()
  read -ra args <<<"$1"
  if ufw delete allow "${args[@]}" >/dev/null 2>&1; then say "firewall: removed $1"; fi
}

# --uninstall: exactly the rules this installer added.
close_ports() {
  local rule
  [[ -f "$UFW_ADDED" ]] || return 0
  if ufw_active; then
    while read -r rule; do
      [[ -n "$rule" ]] || continue
      ufw_delete "$rule"
    done <"$UFW_ADDED"
  fi
  rm -f "$UFW_ADDED"
}
