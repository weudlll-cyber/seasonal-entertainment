# shellcheck shell=bash
# ============================================================
# File:        update-copy.sh
# Path:        deploy/install/lib/update-copy.sh
# Project:     Seasonal Entertainment
# Description: What --update keeps before it moves the code (docs/DEPLOYMENT.md, "Updating"):
#              with backups set up, the fresh encrypted backup (backup_now, services.sh) and
#              nothing else; without them, a plain local copy of the database and the media
#              folder, made by the backup code inside the running site (scripts/backup.mjs with
#              BACKUP_ENCRYPTION=off: SQLite's online backup, checked, server/src/backup/
#              backup.js) into a staging folder inside the container (UPDATE_COPY_STAGING, its
#              own /tmp), fetched with docker compose cp (as root) into UPDATE_COPY_DIR,
#              root-only, the newest UPDATE_COPY_KEEP kept. The copy is not encrypted, which is
#              why it stays on the server and only root may read it: it never passes through a
#              host folder owned by the container's uid 1000, which on the host may be a login
#              account (security check 2026-11-04).
# ============================================================

UPDATE_COPY_DIR=/var/backups/seasonal-update-copies
UPDATE_COPY_KEEP=3
# Inside the site container, never a host folder (see above).
UPDATE_COPY_STAGING=/tmp/seasonal-update-copy
# A copy's folder name: its UTC time (backup.js), so name order is time order.
UPDATE_COPY_NAME='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z$'

# The copies in a folder, oldest first: the glob sorts them, and their names are UTC times.
copies_in() {
  local path
  for path in "$1"/????-??-??T??-??-??Z; do
    if [[ -d "$path" && "${path##*/}" =~ $UPDATE_COPY_NAME ]]; then printf '%s\n' "${path##*/}"; fi
  done
}

# Sets SEASONAL_UPDATE_BACKUP to the backup taken (with backups set up), or makes the copy.
update_safety_copy() {
  if [[ -n "${BACKUP_RECIPIENT:-}" ]]; then
    say "a fresh backup before the update"
    backup_now "the backup before the update"
    say "backup before the update: $BACKUP_HOST_DIR/$NEWEST_BACKUP"
    # One backup per --update: the new installer's install_backups names this one instead of
    # taking a second right after the restart.
    export SEASONAL_UPDATE_BACKUP="$BACKUP_HOST_DIR/$NEWEST_BACKUP"
  else
    update_copy
  fi
}

# The plain copy, without backups set up. Stops the update when it fails: nothing was changed.
update_copy() {
  local incoming="$UPDATE_COPY_DIR/.incoming" name old
  install -d -m 700 -o root -g root "$UPDATE_COPY_DIR"
  rm -rf "$incoming"
  if ! run_step "a copy of the database and the media before the update" \
    compose_site exec -T -e BACKUP_DIR="$UPDATE_COPY_STAGING" -e BACKUP_ENCRYPTION=off \
    site node scripts/backup.mjs ||
    ! run_step "fetching the copy from the site container" \
      compose_site cp "site:$UPDATE_COPY_STAGING" "$incoming"; then
    rm -rf "$incoming"
    drop_update_staging
    die "the copy before the update failed (is the site running? docker compose ps in $SITE_DIR_REL); nothing was changed"
  fi
  drop_update_staging
  name="$(copies_in "$incoming" | tail -n 1)"
  # A real folder only: a link the container put there is never followed by chown or chmod.
  if [[ -z "$name" || -L "$incoming/$name" ]]; then
    rm -rf "$incoming"
    die "the copy before the update is missing; nothing was changed"
  fi
  mv "$incoming/$name" "$UPDATE_COPY_DIR/$name"
  rm -rf "$incoming"
  chown -R root:root "$UPDATE_COPY_DIR/$name"
  chmod -R go-rwx "$UPDATE_COPY_DIR/$name"
  # Only copies (named by their time) count and go: anything else in the folder stays.
  while read -r old; do
    rm -rf "${UPDATE_COPY_DIR:?}/$old"
  done < <(copies_in "$UPDATE_COPY_DIR" | head -n "-$UPDATE_COPY_KEEP")
  say "backups are not set up: a copy of the database and the media before the update is in $UPDATE_COPY_DIR/$name (not encrypted, root only; the newest $UPDATE_COPY_KEEP are kept; set up backups with sudo $INSTALL_DIR/deploy/install.sh --backups)"
}

# The container's staging copy goes once fetched (or failed); best effort, the container's /tmp
# goes with the container anyway.
drop_update_staging() {
  compose_site exec -T site rm -rf "$UPDATE_COPY_STAGING" >/dev/null 2>&1 || true
}
