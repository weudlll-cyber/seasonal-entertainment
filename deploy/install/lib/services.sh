# shellcheck shell=bash
# ============================================================
# File:        services.sh
# Path:        deploy/install/lib/services.sh
# Project:     Seasonal Entertainment
# Description: Starting what was configured (docs/DEPLOYMENT.md): the site image built with the
#              commit, the containers up, /api/health checked over https; the call service with
#              its certificate for TURN (Caddy mode: deploy/site/calls-cert.sh and its timer;
#              nginx mode: the certbot hook) and the recording add-on; the first admin, with the
#              password typed on the terminal (one * per character), checked against the site's
#              password rules and asked again until it fits and is confirmed, then given to
#              scripts/bootstrap-admin.mjs on stdin, after which BOOTSTRAP_TOKEN is removed; the
#              nightly encrypted backup. Long steps and waits run under run_step (common.sh).
# ============================================================

compose_site() { (cd "$INSTALL_DIR/$SITE_DIR_REL" && docker compose "$@"); }
compose_calls() { (cd "$INSTALL_DIR/$CALLS_DIR_REL" && docker compose "$@"); }

start_site() {
  install -d -m 755 -o 1000 -g 1000 "$BACKUP_HOST_DIR" # the image's "node" user is uid 1000
  say "building the site image (commit $(commit_sha | cut -c1-12)); usually 3 to 10 minutes, longer on a small server"
  # Plain progress: if the build fails, the end of its output names the failing step.
  run_step "building the site image" compose_site --progress plain build site ||
    die "the site image did not build"
  say "starting the site$([[ "$MODE" == caddy ]] && echo ' and Caddy')"
  run_step "starting the site" compose_site up -d --remove-orphans ||
    die "docker compose up failed (docker compose logs in $SITE_DIR_REL)"
}

# curl to this server under the site's name: independent of DNS caches. A staging or test CA's
# certificate is not trusted by the system, so its chain is not checked here.
curl_here() {
  local name="$1" path="$2" insecure=()
  [[ -z "${ACME_SERVER:-}" ]] || insecure=(-k)
  curl -fsS --max-time 10 "${insecure[@]}" --resolve "$name:443:127.0.0.1" "https://$name$path"
}

site_healthy() { [[ "$(curl_here "$SITE_DOMAIN" /api/health 2>/dev/null)" == *'"ok":true'* ]]; }

wait_health() {
  say "waiting for https://$SITE_DOMAIN/api/health (certificate and start, up to 5 minutes)"
  run_step "waiting for the site to answer" retry 60 5 site_healthy ||
    die "the site did not answer on https://$SITE_DOMAIN/api/health (docker compose logs; DNS A record pointing here?)"
  say "healthy: $(curl_here "$SITE_DOMAIN" /api/health 2>/dev/null)"
}

# Caddy mode: Caddy has the calls certificate once it answers for the calls name (LiveKit
# behind it may not run yet: 502 counts too).
caddy_has_calls_cert() {
  curl_here "$CALLS_DOMAIN" / >/dev/null 2>&1 ||
    [[ "$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$CALLS_DOMAIN:443:127.0.0.1" "https://$CALLS_DOMAIN/")" == 502 ]]
}

caddy_calls_cert() {
  say "waiting for Caddy's certificate for $CALLS_DOMAIN"
  run_step "waiting for Caddy's certificate for $CALLS_DOMAIN" retry 36 5 caddy_has_calls_cert ||
    die "Caddy has no certificate for $CALLS_DOMAIN yet (DNS A record pointing here?)"
  "$INSTALL_DIR/$SITE_DIR_REL/calls-cert.sh" seasonal-site-caddy-1 "$CALLS_DOMAIN" "$CALLS_CERT_DIR" \
    "$INSTALL_DIR/$CALLS_DIR_REL" >/dev/null 2>&1 || true # its restart step fails while LiveKit is not up
  [[ -f "$CALLS_CERT_DIR/privkey.pem" ]] || die "the calls certificate could not be copied from Caddy"
  sed -e "s|/opt/seasonal-entertainment|$INSTALL_DIR|g" -e "s|CALLS_DOMAIN_HERE|$CALLS_DOMAIN|" \
    -e "s|/etc/seasonal/calls-cert|$CALLS_CERT_DIR|" \
    "$INSTALL_DIR/$SITE_DIR_REL/systemd/seasonal-calls-cert.service" >/etc/systemd/system/seasonal-calls-cert.service
  install -m 644 "$INSTALL_DIR/$SITE_DIR_REL/systemd/seasonal-calls-cert.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now seasonal-calls-cert.timer >/dev/null 2>&1
}

calls_answer() { [[ "$(curl_here "$CALLS_DOMAIN" / 2>/dev/null)" == OK ]]; }

start_calls() {
  [[ -n "${CALLS_DOMAIN:-}" ]] || return 0
  if [[ "${RECORDING:-no}" == yes ]]; then
    install -d -m 755 -o 1000 -g 1000 "$(recordings_host_dir)"
  fi
  write_calls_env
  if [[ "$MODE" == caddy ]]; then
    caddy_calls_cert
  else
    RENEWED_LINEAGE="$CERT_LIVE/seasonal-calls" "$CERTBOT_HOOK" || die "the calls certificate could not be handed to LiveKit"
  fi
  say "starting the call service$([[ "${RECORDING:-no}" == yes ]] && echo ' with recording') (the first time its images are downloaded: usually 1 to 3 minutes)"
  run_step "starting the call service" compose_calls up -d --remove-orphans ||
    die "the call service did not start (docker compose logs in $CALLS_DIR_REL)"
  # The signalling port answers "OK" once LiveKit runs; through the proxy, over https.
  run_step "waiting for the call service to answer" retry 24 5 calls_answer ||
    die "the call service does not answer on https://$CALLS_DOMAIN/"
  say "call service: https://$CALLS_DOMAIN answers"
}

stop_calls() {
  if [[ -f "$(calls_env)" ]]; then compose_calls down --remove-orphans >/dev/null 2>&1 || true; fi
}

# What is wrong with a password, or nothing: mirrors validatePassword in shared/accountRules.js
# (PASSWORD_MIN 10 in UTF-16 units, as JavaScript's length counts; PASSWORD_MAX 72 bytes of
# UTF-8), so the installer asks again instead of the site refusing it after the questions.
# Counted in the C locale, byte by byte, whatever the server's locale is.
password_problem() {
  local LC_ALL=C password="$1" continuation four_byte units
  continuation="${password//[^$'\x80'-$'\xbf']/}"
  four_byte="${password//[^$'\xf0'-$'\xf7']/}"
  # Characters = bytes - continuation bytes; one beyond U+FFFF counts twice in UTF-16.
  units=$((${#password} - ${#continuation} + ${#four_byte}))
  if ((units < 10)); then
    echo "Password must be at least 10 characters long."
  elif ((${#password} > 72)); then
    echo "Password must be at most 72 bytes long."
  fi
}

# The first admin: the password from the terminal only, given on stdin, never stored, logged
# or printed. A password the site would refuse, or two that differ, are asked again.
install_admin() {
  local password confirm problem out
  [[ "${ADMIN_DONE:-no}" == yes ]] && return 0
  if ! have_tty; then
    warn "no terminal: the first admin was not created. Run: sudo $INSTALL_DIR/deploy/install.sh --admin"
    return 0
  fi
  ask ADMIN_NAME "First admin: user name"
  ask ADMIN_EMAIL "First admin: email"
  while true; do
    ask_secret password "Password for $ADMIN_NAME (10 to 72 characters; shown as *)"
    problem="$(password_problem "$password")"
    if [[ -n "$problem" ]]; then
      warn "$problem Please type it again."
      continue
    fi
    ask_secret confirm "The same password again"
    [[ "$password" == "$confirm" ]] && break
    warn "the two passwords differ; please type both again"
  done
  if out="$(printf '%s\n' "$password" | compose_site exec -T site node scripts/bootstrap-admin.mjs "$ADMIN_NAME" "$ADMIN_EMAIL" 2>&1)"; then
    say "first admin \"$ADMIN_NAME\" created: log in at https://$SITE_DOMAIN/login and set up 2FA"
  elif [[ "$out" == *'refused (409)'* ]]; then
    say "an admin exists already (kept)"
  else
    unset password confirm
    die "the first admin could not be created: ${out##*\[bootstrap-admin\] }"
  fi
  unset password confirm
  ADMIN_DONE=yes
  save_state
  # The bootstrap route stays closed once an admin exists; the token goes anyway.
  kv_unset "$(site_env)" BOOTSTRAP_TOKEN
  compose_site up -d site >/dev/null 2>&1 || die "the site did not restart without BOOTSTRAP_TOKEN"
  # The container is replaced: "done" only once the new one answers.
  wait_health
  say "BOOTSTRAP_TOKEN removed, site restarted"
}

# backup_now WHAT: one backup through the systemd unit, as the timer runs it, under run_step;
# stops the run unless the newest file is then an encrypted .tar.age. Sets NEWEST_BACKUP.
backup_now() {
  run_step "$1" systemctl start seasonal-backup.service ||
    die "the backup failed (journalctl -u seasonal-backup.service)"
  # shellcheck disable=SC2012 # backup names are plain timestamps
  NEWEST_BACKUP="$(ls -t "$BACKUP_HOST_DIR" 2>/dev/null | head -n 1)"
  [[ "$NEWEST_BACKUP" == *.tar.age ]] || die "the newest backup is not an encrypted .tar.age ($NEWEST_BACKUP)"
}

# The nightly backup, encrypted to the owner's age public key (docs/DEPLOYMENT.md, "Backups").
install_backups() {
  [[ -n "${BACKUP_RECIPIENT:-}" ]] || return 0
  [[ "$BACKUP_RECIPIENT" =~ ^age1[0-9a-z]{58}$ ]] || die "BACKUP_RECIPIENT is not an age public key (age1…)"
  kv_set "$(site_env)" BACKUP_RECIPIENT "$BACKUP_RECIPIENT"
  compose_site up -d site >/dev/null 2>&1
  sed "s|/opt/seasonal-entertainment|$INSTALL_DIR|g" "$INSTALL_DIR/$SITE_DIR_REL/systemd/seasonal-backup.service" \
    >/etc/systemd/system/seasonal-backup.service
  install -m 644 "$INSTALL_DIR/$SITE_DIR_REL/systemd/seasonal-backup.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now seasonal-backup.timer >/dev/null 2>&1
  wait_health
  say "running one backup now (the database and the media folder; longer with many recordings)"
  backup_now "the first backup"
  say "backups: nightly at 03:30; the first one is $BACKUP_HOST_DIR/$NEWEST_BACKUP"
}
