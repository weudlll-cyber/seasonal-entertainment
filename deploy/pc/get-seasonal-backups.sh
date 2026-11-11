#!/bin/sh
# ============================================================
# File:        get-seasonal-backups.sh
# Path:        deploy/pc/get-seasonal-backups.sh
# Project:     Seasonal Entertainment
# Description: Fetches the site's new encrypted backups from the VPS to a Linux or macOS PC
#              (docs/DEPLOYMENT.md, "Backups to your PC"), the same as Get-SeasonalBackups.ps1
#              and SeasonalBackups.psm1 do on Windows: sftp with a key as the read-only backup
#              user, never a prompt (BatchMode); everything on the server that is not here yet
#              is fetched, so a PC that was off catches up (the server keeps 14 days); files
#              arrive as ".partial" and get their name only when complete; the newest N are
#              kept; every run is logged to download.log. The call recordings' own backups
#              (one per recording, since 2026-11-11) go to <local dir>/recordings/: fetched
#              when not here yet or of another size, never deleted here. Plain POSIX sh, for cron or launchd.
#              Exit code 0: all fetched; 1: something failed (see the log); 2: wrong usage.
#              Example: get-seasonal-backups.sh --server example.org --key-file ~/.ssh/seasonal-backup
#              Tested by get-seasonal-backups.test.sh.
# ============================================================

set -u

usage() {
  cat <<'EOF'
Usage: get-seasonal-backups.sh --server HOST --key-file FILE [options]

  --server HOST       the VPS's name or address
  --key-file FILE     the SSH private key of the backup user (no passphrase: runs unattended)
  --user NAME         the read-only backup user on the VPS (default: seasonal-backup)
  --remote-dir DIR    where the backups are, as that user sees them (default: /backups)
  --local-dir DIR     where they go on this PC (default: ~/SeasonalBackups); not the folder
                      holding the age private key
  --keep N            how many to keep here, the newest (default: 30)
  --log-file FILE     the log of every run (default: <local dir>/download.log)
EOF
}

server="" key_file="" user=seasonal-backup remote_dir=/backups
local_dir="$HOME/SeasonalBackups" keep=30 log_file=""
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || { usage >&2; exit 2; }
  case "$1" in
    --server) server="$2" ;;
    --key-file) key_file="$2" ;;
    --user) user="$2" ;;
    --remote-dir) remote_dir="$2" ;;
    --local-dir) local_dir="$2" ;;
    --keep) keep="$2" ;;
    --log-file) log_file="$2" ;;
    *) usage >&2; exit 2 ;;
  esac
  shift 2
done
if [ -z "$server" ] || [ -z "$key_file" ]; then usage >&2; exit 2; fi
case "$keep" in '' | *[!0-9]*) usage >&2; exit 2 ;; esac
[ -n "$log_file" ] || log_file="$local_dir/download.log"
mkdir -p "$local_dir" || exit 1

# One line with the time into the log file and the output.
log() {
  line="$(date '+%Y-%m-%d %H:%M:%S') $*"
  printf '%s\n' "$line" >>"$log_file"
  printf '%s\n' "$line"
}

# Backup file names among any lines (paths, sftp's own echo), oldest first: what the server
# writes, its UTC time then .tar.age (server/src/backup/encrypted.js); the names sort by time.
backup_names() {
  sed 's|.*/||; s/^[[:space:]]*//; s/[[:space:]]*$//' |
    grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z\.tar\.age$' | sort -u
}

# sftp with one batch command on stdin; its output on stdout, non-zero when it failed.
# BatchMode: never stop to ask for a password; the key is the only way in.
run_sftp() {
  printf '%s\n' "$1" | sftp -b - -i "$key_file" -o BatchMode=yes "$user@$server" 2>&1
}

if ! listing="$(run_sftp "ls -1 $remote_dir")"; then
  log "RUN FAILED: sftp failed: $(printf '%s' "$listing" | tr '\n' ' ')"
  exit 1
fi
remote="$(printf '%s\n' "$listing" | backup_names)"
# shellcheck disable=SC2012 # backup names are plain timestamps
here="$(ls -1 "$local_dir" | backup_names)"
# The ones not here yet (each line of $here is a pattern of its own; '' drops empty lines).
missing="$(printf '%s\n' "$remote" | grep -vxF -e "$here" -e '')"
log "server has $(printf '%s' "$remote" | grep -c .) backups, $(printf '%s' "$missing" | grep -c .) new"

failed=""
for name in $missing; do
  partial="$local_dir/$name.partial"
  if out="$(run_sftp "get $remote_dir/$name \"$partial\"")" && [ -f "$partial" ]; then
    mv -f "$partial" "$local_dir/$name"
    log "fetched $name"
  else
    # (A half file is swept up below.)
    log "FAILED $name : $(printf '%s' "${out:-nothing arrived}" | tr '\n' ' ')"
    failed="${failed:+$failed, }$name"
  fi
done

# The call recordings' own backups (server/src/backup/recordings.js, since 2026-11-11): each one
# fetched once into <local dir>/recordings/, again only when its size on the server differs (it
# was backed up once more); never deleted here, also when the server has let it go.
rec_dir="$local_dir/recordings"
mkdir -p "$rec_dir" || exit 1
if rec_listing="$(run_sftp "ls -l $remote_dir/recordings")"; then
  # "ls -l" lines: the size is the 5th field, the path the last; only encrypted backups.
  printf '%s\n' "$rec_listing" |
    awk '$NF ~ /\.age$/ { name = $NF; sub(/.*\//, "", name); print $5, name }' >"$rec_dir/.listing"
  fetched=0
  while read -r size name; do
    have=""
    [ -f "$rec_dir/$name" ] && have="$(wc -c <"$rec_dir/$name" | tr -d ' ')"
    [ "${have:-}" = "$size" ] && continue
    partial="$rec_dir/$name.partial"
    if out="$(run_sftp "get $remote_dir/recordings/$name \"$partial\"")" && [ -f "$partial" ]; then
      mv -f "$partial" "$rec_dir/$name"
      fetched=$((fetched + 1))
      log "fetched recording $name"
    else
      log "FAILED recording $name : $(printf '%s' "${out:-nothing arrived}" | tr '\n' ' ')"
      failed="${failed:+$failed, }recording $name"
    fi
  done <"$rec_dir/.listing"
  rm -f "$rec_dir/.listing"
  log "recordings: $fetched fetched"
else
  # A server from before 2026-11-11 has no such folder yet: nothing to fetch, no failure.
  log "recordings: none on the server yet"
fi

# Leftovers of broken downloads, then the oldest beyond the newest $keep (archives only: the
# recordings are kept).
for partial in "$local_dir"/*.partial "$rec_dir"/*.partial; do
  [ -f "$partial" ] || continue
  rm -f "$partial"
  log "removed ${partial##*/} (a broken download)"
done
# shellcheck disable=SC2012 # backup names are plain timestamps
present="$(ls -1 "$local_dir" | backup_names)"
count="$(printf '%s' "$present" | grep -c .)"
if [ "$count" -gt "$keep" ]; then
  for name in $(printf '%s\n' "$present" | head -n "$((count - keep))"); do
    rm -f "$local_dir/$name"
    log "removed $name (keeping $keep)"
  done
fi

if [ -n "$failed" ]; then
  log "RUN FAILED: could not fetch: $failed"
  exit 1
fi
log "done"
