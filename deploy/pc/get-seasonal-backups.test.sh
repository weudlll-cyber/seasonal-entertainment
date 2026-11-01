#!/bin/sh
# ============================================================
# File:        get-seasonal-backups.test.sh
# Path:        deploy/pc/get-seasonal-backups.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of the backup download to a Linux or macOS PC (get-seasonal-backups.sh),
#              the same cases as SeasonalBackups.Tests.ps1 on Windows, with plain checks and no
#              test framework: only backup names count; a PC that was off fetches everything it
#              missed; the newest N are kept; a failed download leaves no half file, the others
#              still arrive, and the run says so; sftp always runs non-interactive with the key.
#              A fake sftp first on PATH serves files from a temporary "server" folder.
#              Run: sh deploy/pc/get-seasonal-backups.test.sh; CI runs it. Exit code 1 on any
#              failure.
# ============================================================

set -u

script="$(cd "$(dirname "$0")" && pwd)/get-seasonal-backups.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

check() {
  what="$1"
  shift
  if "$@"; then echo "ok   $what"; else echo "FAIL $what"; failures=$((failures + 1)); fi
}

stamp() { printf '2026-10-%02dT03-30-00Z.tar.age' "$1"; }

# The fake sftp: records its arguments, reads the one batch command from stdin; "ls -1" lists
# $FAKE_SERVER (with a line that is no backup name, and sftp's own echo), "get" copies a file;
# a name in $FAKE_FAIL_ON leaves a half file and fails.
mkdir -p "$work/bin"
cat >"$work/bin/sftp" <<'EOF'
#!/bin/sh
echo "$*" >>"$FAKE_CALLS"
read -r command
case "$command" in
  "ls -1 "*)
    echo "sftp> $command"
    for file in "$FAKE_SERVER"/*; do echo "/backups/${file##*/}"; done
    ;;
  "get "*)
    name="$(echo "$command" | sed 's|^get /backups/\([^ ]*\) .*|\1|')"
    target="$(echo "$command" | sed 's|^get [^ ]* "\(.*\)"$|\1|')"
    if [ "$name" = "${FAKE_FAIL_ON:-}" ]; then
      echo half >"$target"
      echo "Connection reset"
      exit 1
    fi
    cp "$FAKE_SERVER/$name" "$target"
    ;;
esac
EOF
chmod +x "$work/bin/sftp"
PATH="$work/bin:$PATH"
export PATH FAKE_CALLS FAKE_SERVER FAKE_FAIL_ON

# run LOCAL_DIR [options]: the script against the fake server, its log in LOCAL_DIR/run.log.
run() {
  dir="$1"
  shift
  "$script" --server vps.example --key-file /home/me/key --local-dir "$dir" \
    --log-file "$dir/run.log" "$@" >/dev/null
}
run_fails() { ! run "$@"; }
# The file names in a folder, in order, without the run's log.
names_in() {
  for file in "$1"/*; do
    [ "${file##*/}" = run.log ] || printf '%s ' "${file##*/}"
  done
}
last_line_done() { tail -n 1 "$1" | grep -q ' done$'; }

# --- a PC that was off catches up, keeps the newest N, uses the key non-interactively
FAKE_SERVER="$work/server1" FAKE_CALLS="$work/calls1" FAKE_FAIL_ON=""
mkdir -p "$FAKE_SERVER" "$work/local1"
for day in 1 2 3 4 5; do echo "backup $day" >"$FAKE_SERVER/$(stamp "$day")"; done
echo notes >"$FAKE_SERVER/notes.txt"
echo "backup 1" >"$work/local1/$(stamp 1)"
check "the run succeeds" run "$work/local1" --keep 3
check "caught up, newest three kept, only backup names" \
  test "$(names_in "$work/local1")" = "$(stamp 3) $(stamp 4) $(stamp 5) "
check "the content arrived" test "$(cat "$work/local1/$(stamp 5)")" = "backup 5"
check "one listing and four downloads (2 to 5)" test "$(wc -l <"$FAKE_CALLS" | tr -d ' ')" = 5
check "key and batch mode, never a prompt" \
  test "$(head -n 1 "$FAKE_CALLS")" = "-b - -i /home/me/key -o BatchMode=yes seasonal-backup@vps.example"
check "the log says what it found" grep -q 'server has 5 backups, 4 new$' "$work/local1/run.log"
check "the log ends with done" last_line_done "$work/local1/run.log"

# --- a failed download: no half file, the others arrive, the run fails
FAKE_SERVER="$work/server2" FAKE_CALLS="$work/calls2" FAKE_FAIL_ON="$(stamp 7)"
mkdir -p "$FAKE_SERVER" "$work/local2"
for day in 6 7 8; do echo "backup $day" >"$FAKE_SERVER/$(stamp "$day")"; done
check "the run fails" run_fails "$work/local2"
check "the others arrived, no .partial left" test "$(names_in "$work/local2")" = "$(stamp 6) $(stamp 8) "
check "the log names the missing backup" grep -q "RUN FAILED: could not fetch: $(stamp 7)" "$work/local2/run.log"
# The next run fetches it once the server answers again.
FAKE_FAIL_ON=""
check "the next run catches up" run "$work/local2"
check "the missing backup is there now" test -f "$work/local2/$(stamp 7)"

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
