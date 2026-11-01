# shellcheck shell=bash
# ============================================================
# File:        detect.sh
# Path:        deploy/install/lib/detect.sh
# Project:     Seasonal Entertainment
# Description: What the installer finds on the server (docs/DEPLOYMENT.md, "The two modes"):
#              Ubuntu 22.04 or 24.04; who listens on ports 80 and 443 and so which mode it takes
#              (nothing → the site's own Caddy; nginx → nginx mode; anything else → it stops);
#              how nginx includes site files; whether the server speaks IPv6; free local ports.
# ============================================================

# os_release FIELD: one field of /etc/os-release, read in a subshell so nothing leaks.
os_release() {
  # shellcheck source=/dev/null # the system's file, not part of the repository
  (. /etc/os-release && printf '%s\n' "${!1:-}")
}

check_os() {
  local id version
  id="$(os_release ID)"
  version="$(os_release VERSION_ID)"
  [[ "$id" == ubuntu && ( "$version" == 22.04 || "$version" == 24.04 ) ]] ||
    die "this installer supports Ubuntu 22.04 and 24.04 (found $id $version)"
  say "server: Ubuntu $version"
}

# The process names listening on TCP 80 or 443, one per line (empty: nobody). "|| true": grep
# finding nothing is the normal answer, not a failure (pipefail).
web_listeners() {
  { ss -Hltnp '( sport = :80 or sport = :443 )' 2>/dev/null |
    grep -o 'users:(("[^"]*"' || true; } | sed 's/users:(("//; s/"$//' | sort -u
}

# Our own Caddy from an earlier run: Docker publishes its ports through docker-proxy (or the
# kernel, without a proxy process), so the container decides.
own_caddy_running() {
  command -v docker >/dev/null &&
    docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'seasonal-site-caddy-1'
}

# Sets MODE: kept from an earlier run, else decided from what listens on 80/443.
decide_mode() {
  local found
  if [[ -n "${MODE:-}" ]]; then
    say "mode: $MODE (from the earlier run)"
    return 0
  fi
  found="$(web_listeners | tr '\n' ' ' | sed 's/ $//')"
  if [[ -z "$found" ]] || own_caddy_running; then
    MODE=caddy
    say "mode: caddy (nothing else serves ports 80/443; the site brings its own Caddy)"
  elif [[ "$found" == nginx ]]; then
    MODE=nginx
    say "mode: nginx (nginx already serves ports 80/443; the site gets server files of its own)"
  else
    die "ports 80/443 are served by \"$found\": only an empty server or nginx are supported; nothing was changed"
  fi
}

# How nginx takes site files: Debian/Ubuntu's sites-available + sites-enabled, else conf.d.
# shellcheck disable=SC2034 # NGINX_CONF_STYLE is read by nginx.sh and saved in the state
detect_nginx_style() {
  if [[ -d /etc/nginx/sites-enabled ]] && grep -rqs 'sites-enabled' /etc/nginx/nginx.conf; then
    NGINX_CONF_STYLE=sites
  else
    NGINX_CONF_STYLE=confd
  fi
}

# true when the kernel speaks IPv6 (nginx then also listens on [::]).
has_ipv6() { [[ -f /proc/net/if_inet6 ]]; }

# true when nothing listens on 127.0.0.1:<port> (or on all addresses).
local_port_free() {
  ! ss -Hltn "( sport = :$1 )" 2>/dev/null | grep -q .
}

# A server name of ours that a file not written by the installer already serves: changing that
# would mean editing someone else's nginx file, which the installer never does.
nginx_name_taken() {
  local name="$1"
  nginx -T 2>/dev/null | awk -v name="$name" '
    /^# configuration file / { file = $4; sub(/:$/, "", file) }
    $1 == "server_name" { for (i = 2; i <= NF; i++) { n = $i; sub(/;$/, "", n); if (n == name) print file } }
  ' | { grep -Ev "$NGINX_OWN_FILE_RE" || true; } | head -n 1
}
