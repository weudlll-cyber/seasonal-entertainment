#!/bin/bash
# ============================================================
# File:        update-copy.test.sh
# Path:        deploy/test/update-copy.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of what --update keeps before it moves the code (deploy/install/lib/
#              update-copy.sh; docs/DEPLOYMENT.md, "Updating"): without backups set up, a copy
#              made by the backup code in the site container lands in the fixed folder, root
#              only, named in the output, the staging folder gone, the newest three kept and
#              nothing else in the folder touched; a failed copy stops the update and leaves
#              nothing; with backups set up only the encrypted backup is taken, no copy. The site
#              container is pretended (compose_site writes what scripts/backup.mjs would), and
#              chown and the owners of install are recorded, so no root is needed. Plain
#              checks, no framework. Run: bash deploy/test/update-copy.test.sh; CI runs it.
#              Exit code 1 on any failure.
# ============================================================

set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../install/lib" && pwd)"
# shellcheck source=SCRIPTDIR/../install/lib/common.sh
source "$LIB/common.sh"
# shellcheck source=SCRIPTDIR/../install/lib/update-copy.sh
source "$LIB/update-copy.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }

INSTALL_DIR=/opt/seasonal-entertainment
SITE_DIR_REL=deploy/site
BACKUP_HOST_DIR="$work/backups"
UPDATE_COPY_DIR="$work/copies"
mkdir -p "$BACKUP_HOST_DIR"

# The pretended server: steps run directly; owners are recorded, not set.
run_step() { shift; "$@"; }
chown() { echo "chown $*" >>"$work/owners"; }
install() {
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -o | -g) echo "install $1 $2 ${*: -1}" >>"$work/owners"; shift 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  command install "${args[@]}"
}
# The site container's backup: the next UTC time, written where BACKUP_DIR points (/backups is
# the host's BACKUP_HOST_DIR). COPY_FAILS=1 pretends the site is down.
# The count is kept in a file: some runs are in a subshell, $(...).
echo 0 >"$work/made"
compose_site() {
  local dir made
  [[ -z "${COPY_FAILS:-}" ]] || return 1
  dir="$(printf '%s\n' "$@" | sed -n 's|^BACKUP_DIR=/backups/||p')"
  [[ " $* " == *" BACKUP_ENCRYPTION=off "* ]] || return 1
  made=$(($(cat "$work/made") + 1))
  echo "$made" >"$work/made"
  mkdir -p "$BACKUP_HOST_DIR/$dir/2026-11-04T10-00-0${made}Z/media"
  echo db >"$BACKUP_HOST_DIR/$dir/2026-11-04T10-00-0${made}Z/seasonal.db"
}
# The names in a folder, on one line.
names() {
  local path
  for path in "$1"/*; do printf '%s ' "${path##*/}"; done
}
backup_now() {
  echo "backup_now" >>"$work/backups-taken"
  NEWEST_BACKUP=2026-11-04T10-00-00Z.tar.age
}

# Without backups: one copy, root only, in the fixed folder, named.
unset BACKUP_RECIPIENT
out="$(update_safety_copy 2>&1)"
copy="$UPDATE_COPY_DIR/2026-11-04T10-00-01Z"
if [[ -f "$copy/seasonal.db" && -d "$copy/media" ]]; then ok 'the copy is in the fixed folder'; else bad "no copy: $out"; fi
if [[ ! -e "$BACKUP_HOST_DIR/.update-copy" && -z "$(ls -A "$BACKUP_HOST_DIR")" ]]; then ok 'the staging folder is gone'; else bad "left in the backups: $(ls -A "$BACKUP_HOST_DIR")"; fi
if grep -q "chown -R root:root $copy" "$work/owners" && grep -q "install -o root $UPDATE_COPY_DIR" "$work/owners"; then ok 'owned by root'; else bad "owners: $(cat "$work/owners")"; fi
if [[ "$(stat -c %a "$UPDATE_COPY_DIR")" == 700 && "$(stat -c %a "$copy")" == 700 ]]; then ok 'only root may read it'; else bad "modes: $(stat -c '%a %n' "$UPDATE_COPY_DIR" "$copy")"; fi
if [[ "$out" == *"before the update is in $copy (not encrypted, root only"* ]]; then ok 'says where'; else bad "message: $out"; fi
if [[ ! -e "$work/backups-taken" && -z "${SEASONAL_UPDATE_BACKUP:-}" ]]; then ok 'no backup without backups set up'; else bad 'a backup was taken'; fi

# More updates: the newest three copies kept; anything else in the folder stays.
echo mine >"$UPDATE_COPY_DIR/notes.txt"
for _ in 2 3 4; do update_safety_copy >/dev/null 2>&1; done
kept="$(names "$UPDATE_COPY_DIR")"
if [[ "$kept" == '2026-11-04T10-00-02Z 2026-11-04T10-00-03Z 2026-11-04T10-00-04Z notes.txt ' ]]; then ok 'the newest three kept, nothing else touched'; else bad "kept: $kept"; fi

# A failed copy stops the update (the installer's die) and leaves nothing behind.
before="$(names "$UPDATE_COPY_DIR")"
out="$(COPY_FAILS=1 update_safety_copy 2>&1)"
status=$?
if [[ "$status" -ne 0 && "$out" == *"STOPPED: the copy before the update failed"*"nothing was changed"* ]]; then ok 'a failed copy stops the update'; else bad "failed copy: $status $out"; fi
if [[ ! -e "$BACKUP_HOST_DIR/.update-copy" && "$(names "$UPDATE_COPY_DIR")" == "$before" ]]; then ok 'a failed copy leaves nothing'; else bad 'a failed copy left something'; fi

# With backups set up: the encrypted backup, named for the new installer, and no copy.
rm -rf "$UPDATE_COPY_DIR"
BACKUP_RECIPIENT=age1example
update_safety_copy >/dev/null 2>&1
if [[ "$(cat "$work/backups-taken" 2>/dev/null)" == backup_now && ! -e "$UPDATE_COPY_DIR" ]]; then ok 'with backups: the backup, no copy'; else bad 'with backups set up'; fi
if [[ "${SEASONAL_UPDATE_BACKUP:-}" == "$BACKUP_HOST_DIR/2026-11-04T10-00-00Z.tar.age" ]]; then ok 'the backup named for the new installer'; else bad "SEASONAL_UPDATE_BACKUP=${SEASONAL_UPDATE_BACKUP:-}"; fi

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
