# shellcheck shell=bash
# ============================================================
# File:        manage.sh
# Path:        deploy/install/lib/manage.sh
# Project:     Seasonal Entertainment
# Description: Everything around an install (docs/DEPLOYMENT.md): the snapshot taken before a
#              run changes anything (/var/backups/seasonal-install/<time>/: the nginx folder, the
#              ufw rules, the installer's state and the commit) and --rollback to it; --status;
#              --uninstall, which removes only what the installer added (its nginx files, also
#              under their names before 2026-11-01, the containers, its ufw rules, timers, the
#              certbot hook) and keeps data, secrets and certificates; --purge-data, which also
#              deletes the site's data after a typed confirmation.
# ============================================================

take_snapshot() {
  SNAPSHOT="$SNAPSHOT_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
  install -d -m 700 "$SNAPSHOT"
  [[ -d /etc/nginx ]] && tar -C /etc -czf "$SNAPSHOT/nginx.tar.gz" nginx
  if command -v ufw >/dev/null; then ufw status numbered >"$SNAPSHOT/ufw-status.txt" 2>&1 || true; fi
  [[ -f "$STATE_FILE" ]] && cp -p "$STATE_FILE" "$SNAPSHOT/install.conf"
  [[ -f "$UFW_ADDED" ]] && cp -p "$UFW_ADDED" "$SNAPSHOT/ufw-added"
  commit_sha >"$SNAPSHOT/commit"
  say "snapshot of what this run may touch: $SNAPSHOT"
  say "to undo this run later: sudo $INSTALL_DIR/deploy/install.sh --rollback $SNAPSHOT"
}

# --rollback DIR: the installer's nginx files, ufw rules, state and commit as they were.
rollback() {
  local snap="$1" path rule
  [[ -f "$snap/commit" ]] || die "$snap is not an installer snapshot"
  say "rolling back to $snap"
  if [[ -f "$snap/nginx.tar.gz" ]] && command -v nginx >/dev/null; then
    # Today's and the old file names: a snapshot from before the rename brings the old ones back.
    for path in $(nginx_own_paths); do
      rm -f "$path"
      tar -C /etc -xzf "$snap/nginx.tar.gz" "${path#/etc/}" 2>/dev/null || true
    done
    nginx -t >/dev/null 2>&1 || die "nginx -t fails with the snapshot's files; check /etc/nginx by hand"
    systemctl reload nginx
    say "nginx: the installer's files as in the snapshot (nginx -t passed, reloaded)"
  fi
  if [[ -f "$UFW_ADDED" ]] && ufw_active; then
    while read -r rule; do
      [[ -n "$rule" ]] || continue
      grep -qxF "$rule" "$snap/ufw-added" 2>/dev/null || ufw_delete "$rule"
    done <"$UFW_ADDED"
    if [[ -f "$snap/ufw-added" ]]; then cp -p "$snap/ufw-added" "$UFW_ADDED"; else rm -f "$UFW_ADDED"; fi
  fi
  if [[ -f "$snap/install.conf" ]]; then cp -p "$snap/install.conf" "$STATE_FILE"; else rm -f "$STATE_FILE"; fi
  local commit
  commit="$(cat "$snap/commit")"
  if [[ "$commit" != unknown && "$commit" != "$(commit_sha)" && -f "$snap/install.conf" ]]; then
    git -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" checkout -q "$commit" ||
      die "could not check out $commit"
    say "code: back at $commit; run the installer again to rebuild and restart"
  elif [[ ! -f "$snap/install.conf" ]]; then
    say "the snapshot is from before the first install: run --uninstall to remove the containers too"
  fi
  say "rollback done"
}

status() {
  load_state
  if [[ ! -f "$STATE_FILE" ]]; then
    say "not installed on this server"
    return 0
  fi
  say "mode: $MODE; site: https://$SITE_DOMAIN$([[ "$WWW_REDIRECT" == yes ]] && echo " (www redirects)")"
  say "calls: ${CALLS_DOMAIN:-none}$([[ -n "$CALLS_DOMAIN" && "$RECORDING" == yes ]] && echo ', recording on')"
  say "code in $INSTALL_DIR: $(commit_sha | cut -c1-12)"
  if command -v docker >/dev/null; then
    docker ps -a --filter 'name=^seasonal-' --format '[install] container {{.Names}}: {{.Status}}'
  fi
  local health
  if health="$(curl_here "$SITE_DOMAIN" /api/health 2>/dev/null)"; then
    say "health: $health"
  else
    say "health: NOT answering on https://$SITE_DOMAIN/api/health"
  fi
  [[ "$MODE" != nginx ]] || say "nginx files: $(nginx_own_files | tr '\n' ' ')"
  if [[ "$MODE" == nginx ]] && command -v certbot >/dev/null; then
    certbot certificates 2>/dev/null | awk '/Certificate Name: seasonal-/ { n = $3 } n && /Expiry Date/ { sub(/.*Expiry Date: */, ""); print "[install] certificate " n ": " $0; n = "" }'
  fi
  systemctl list-timers --all --no-legend 'seasonal-*' 2>/dev/null | awk '{ print "[install] timer " $NF ": next " $1 " " $2 " " $3 }'
  [[ -f "$UFW_ADDED" ]] && say "firewall rules added by the installer: $(paste -sd ';' "$UFW_ADDED" | sed 's/;/; /g')"
  # shellcheck disable=SC2012 # backup names are plain timestamps
  say "backups: $(ls -t "$BACKUP_HOST_DIR" 2>/dev/null | head -n 1 || true) ($(ls "$BACKUP_HOST_DIR" 2>/dev/null | wc -l) kept)"
  [[ "$ADMIN_DONE" == yes ]] || say "the first admin is not created yet: sudo $INSTALL_DIR/deploy/install.sh --admin"
}

uninstall() {
  local purge="$1" unit
  load_state
  [[ -f "$STATE_FILE" ]] || die "not installed on this server"
  say "uninstalling: containers, the installer's nginx files, its firewall rules, timers, hook"
  stop_calls
  compose_site down --remove-orphans >/dev/null 2>&1 || true
  [[ "$MODE" == nginx ]] && remove_nginx_files
  close_ports
  for unit in seasonal-backup seasonal-calls-cert; do
    systemctl disable --now "$unit.timer" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$unit.timer" "/etc/systemd/system/$unit.service"
  done
  systemctl daemon-reload
  if [[ "$purge" == yes ]]; then
    purge_data
  else
    say "kept: the site's data (Docker volume seasonal-site_site-data), backups in $BACKUP_HOST_DIR,"
    say "kept: secrets ($SITE_DIR_REL/site.env, $STATE_DIR), certificates; installing again reuses them"
  fi
  say "uninstalled"
}

purge_data() {
  local typed
  have_tty || die "--purge-data needs a terminal for its confirmation"
  printf '[install] This deletes the database, uploads and recordings of %s for good.\n' "$SITE_DOMAIN" >/dev/tty
  printf '[install] Type the site name (%s) to confirm: ' "$SITE_DOMAIN" >/dev/tty
  IFS= read -r typed </dev/tty
  [[ "$typed" == "$SITE_DOMAIN" ]] || die "not confirmed: the data is kept"
  docker volume rm seasonal-site_site-data >/dev/null 2>&1 || true
  rm -f "$STATE_FILE"
  say "deleted: the site's data volume and the installer's answers; kept: backups in $BACKUP_HOST_DIR, secrets, certificates"
}
