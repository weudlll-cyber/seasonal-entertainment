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

# The fake sftp: records its arguments, reads the one batch command from stdin; "ls -l" lists
# the recordings' folder with sizes (fails without one), "ls -1" lists
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
  "ls -l "*)
    # The recordings' folder (a server from before 2026-11-11 has none: sftp fails).
    dir="$FAKE_SERVER/${command#ls -l /backups/}"
    [ -d "$dir" ] || { echo "Can't ls: \"${command#ls -l }\" not found"; exit 1; }
    echo "sftp> $command"
    for file in "$dir"/*; do
      [ -f "$file" ] || continue
      printf -- '-rw-r-----    1 1000     1001     %s Nov 11 03:30 /backups/recordings/%s
'         "$(wc -c <"$file" | tr -d ' ')" "${file##*/}"
    done
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
    [ -d "$file" ] && continue # the recordings' own folder
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
check "two listings (backups, recordings) and four downloads (2 to 5)"   test "$(wc -l <"$FAKE_CALLS" | tr -d ' ')" = 6
check "no recordings folder on the server is no failure"   grep -q 'recordings: none on the server yet$' "$work/local1/run.log"
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

# --- the recordings' own backups: fetched once, again when their size differs, never deleted
FAKE_SERVER="$work/server3" FAKE_CALLS="$work/calls3" FAKE_FAIL_ON=""
mkdir -p "$FAKE_SERVER/recordings" "$work/local3/recordings"
echo "backup 9" >"$FAKE_SERVER/$(stamp 9)"
echo "recording a" >"$FAKE_SERVER/recordings/a.mp4.age"
echo "recording b, backed up again" >"$FAKE_SERVER/recordings/b.mp4.age"
echo "2026-11-01T03:30:00.000Z" >"$FAKE_SERVER/recordings/c.mp4.age.gone"
echo "recording b" >"$work/local3/recordings/b.mp4.age"
check "the run with recordings succeeds" run "$work/local3"
check "a new recording arrived" test "$(cat "$work/local3/recordings/a.mp4.age")" = "recording a"
check "one of another size is fetched again"   test "$(cat "$work/local3/recordings/b.mp4.age")" = "recording b, backed up again"
check "only the backups, no marks" test ! -e "$work/local3/recordings/c.mp4.age.gone"
check "the log counts them" grep -q 'recordings: 2 fetched$' "$work/local3/run.log"
# The server let a.mp4.age go: the PC keeps it, and fetches nothing again.
rm "$FAKE_SERVER/recordings/a.mp4.age"
check "the next run succeeds" run "$work/local3"
check "a recording gone from the server stays here" test -f "$work/local3/recordings/a.mp4.age"
check "nothing fetched again" grep -q 'recordings: 0 fetched$' "$work/local3/run.log"

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
