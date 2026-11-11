#!/bin/bash
# ============================================================
# File:        backup-listing.test.sh
# Path:        deploy/test/backup-listing.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of how the installer finds the backups in the backup folder
#              (deploy/install/lib/common.sh: newest_backup and backup_count; used by
#              backup_now before an install or update and by --status): only the encrypted
#              <UTC time>.tar.age archives count, the newest by name, never the recordings/
#              folder beside them, which the nightly backup writes right after the archive (so
#              by time it is the newest entry); an empty or missing folder gives nothing and 0.
#              Plain checks, no framework, no root. Run: bash deploy/test/backup-listing.test.sh;
#              CI runs it. Exit code 1 on any failure.
# ============================================================

set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../install/lib" && pwd)"
# shellcheck source=SCRIPTDIR/../install/lib/common.sh
source "$LIB/common.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
check() {
  if [[ "$2" == "$3" ]]; then echo "ok   $1"; else
    echo "FAIL $1"
    echo "  expected: $2"
    echo "  actual:   $3"
    failures=$((failures + 1))
  fi
}

# A folder as the nightly backup leaves it: two archives, then recordings/ written last.
folder="$work/backups"
mkdir -p "$folder"
touch "$folder/2026-11-09T03-30-00Z.tar.age" "$folder/2026-11-10T03-30-00Z.tar.age"
touch "$folder/2026-11-10T03-30-00Z.tar.age.tmp"
mkdir "$folder/recordings"
touch "$folder/recordings/7.mp4.age"
# The folder's time later than every archive's, as after a night that added a recording.
touch -d '+1 minute' "$folder/recordings"
check 'the newest archive, not the recordings folder' 2026-11-10T03-30-00Z.tar.age \
  "$(newest_backup "$folder")"
check 'only the archives are counted' 2 "$(backup_count "$folder")"

mkdir "$work/empty"
check 'an empty folder: no backup' '' "$(newest_backup "$work/empty")"
check 'an empty folder: 0 kept' 0 "$(backup_count "$work/empty")"
check 'no folder at all: no backup' '' "$(newest_backup "$work/missing")"
check 'no folder at all: 0 kept' 0 "$(backup_count "$work/missing")"

[[ "$failures" -eq 0 ]] || exit 1
