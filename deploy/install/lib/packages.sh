# shellcheck shell=bash
# ============================================================
# File:        packages.sh
# Path:        deploy/install/lib/packages.sh
# Project:     Seasonal Entertainment
# Description: The packages the installer may add, and only when they are missing: Docker
#              Engine with the Compose plugin (from Docker's own apt repository, as Docker's
#              install guide for Ubuntu), certbot for nginx mode, git for updates. It never
#              upgrades or removes another package (apt-get --no-upgrade). apt runs under
#              run_step (common.sh), so a long install shows "still working" lines.
# ============================================================

# apt-get without questions. Ubuntu's needrestart runs after every apt run: it scans all
# processes ("Scanning processes...", a silent minute on a busy server; run_step now reports
# it as still working) and, in its default modes, may ask on the terminal or restart services
# by itself. NEEDRESTART_MODE=l (list only) keeps it from ever prompting, or restarting another
# site's nginx or ssh in the middle of the run; `sudo needrestart` shows later what waits.
apt_get() { DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get "$@"; }

apt_install() {
  run_step "installing $*" apt_get install -y --no-upgrade --no-install-recommends "$@" ||
    die "could not install: $*"
}

apt_updated=no
apt_update_once() {
  [[ "$apt_updated" == yes ]] && return 0
  run_step "apt-get update" apt_get update -qq || die "apt-get update failed"
  apt_updated=yes
}

ensure_base_tools() {
  local missing=()
  command -v curl >/dev/null || missing+=(curl)
  command -v openssl >/dev/null || missing+=(openssl)
  command -v git >/dev/null || missing+=(git)
  [[ -f /etc/ssl/certs/ca-certificates.crt ]] || missing+=(ca-certificates)
  ((${#missing[@]} == 0)) && return 0
  say "installing missing tools: ${missing[*]}"
  apt_update_once
  apt_install "${missing[@]}"
}

ensure_docker() {
  if command -v docker >/dev/null; then
    if ! docker compose version >/dev/null 2>&1; then
      say "installing the Docker Compose plugin"
      apt_update_once
      # Docker's repository calls it docker-compose-plugin, Ubuntu's own docker.io docker-compose-v2.
      run_step "installing docker-compose-plugin" apt_get install -y --no-upgrade docker-compose-plugin ||
        apt_install docker-compose-v2
    fi
    systemctl is-active --quiet docker || systemctl start docker || die "Docker does not start"
    say "Docker: $(docker --version | sed 's/,.*//') with Compose $(docker compose version --short)"
    return 0
  fi
  say "installing Docker Engine and the Compose plugin (Docker's apt repository; usually 1 to 3 minutes)"
  apt_update_once
  apt_install ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc ||
    die "could not fetch Docker's signing key"
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$(os_release VERSION_CODENAME)" \
    >/etc/apt/sources.list.d/docker.list
  apt_updated=no
  apt_update_once
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker >/dev/null 2>&1 || die "Docker does not start"
  say "Docker installed: $(docker --version | sed 's/,.*//')"
}

# nginx mode: an existing certbot is used as it is; otherwise Ubuntu's certbot package.
ensure_certbot() {
  if command -v certbot >/dev/null; then
    say "certbot: $(certbot --version 2>&1) (already installed, used as it is)"
    return 0
  fi
  say "installing certbot (Ubuntu's package, with its renewal timer; usually under a minute)"
  apt_update_once
  apt_install certbot
}
