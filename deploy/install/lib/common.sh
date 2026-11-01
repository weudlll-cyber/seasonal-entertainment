# shellcheck shell=bash
# ============================================================
# File:        common.sh
# Path:        deploy/install/lib/common.sh
# Project:     Seasonal Entertainment
# Description: The installer's shared helpers (deploy/install.sh, docs/DEPLOYMENT.md): one-line
#              messages, stopping with a reason and the rollback command, long steps with a
#              "still working" line instead of a silent pause, questions on the terminal (with
#              an explanation shown only when really asked; secrets echoed as one * per
#              character), KEY=VALUE files read without executing them and edited key by key,
#              and the installer's own state in /etc/seasonal/.
# ============================================================

# Where the installer keeps what it must remember between runs (root only).
STATE_DIR=/etc/seasonal
STATE_FILE="$STATE_DIR/install.conf"
# shellcheck disable=SC2034 # read by manage.sh
SNAPSHOT_ROOT=/var/backups/seasonal-install

say() { printf '[install] %s\n' "$*"; }
warn() { printf '[install] WARNING: %s\n' "$*" >&2; }

# Stops the run. A snapshot taken earlier in this run is named, with the command that undoes it.
die() {
  printf '[install] STOPPED: %s\n' "$*" >&2
  if [[ -n "${SNAPSHOT:-}" ]]; then
    printf '[install] To undo what this run changed: sudo %s --rollback %s\n' \
      "$INSTALL_DIR/deploy/install.sh" "$SNAPSHOT" >&2
  fi
  exit 1
}

# A terminal to ask on, also when stdin is a pipe; none in unattended runs.
have_tty() { [[ -r /dev/tty && -w /dev/tty ]] && { : </dev/tty; } 2>/dev/null; }

# ask VAR "question" [default] [explanation]: keeps VAR when it already has a value (answers
# file, state). The explanation is printed before the question, so only when it is asked.
ask() {
  local var="$1" question="$2" default="${3:-}" explanation="${4:-}" reply
  [[ -n "${!var:-}" ]] && return 0
  if ! have_tty || [[ "${UNATTENDED:-no}" == yes ]]; then
    [[ -n "$default" ]] && { printf -v "$var" '%s' "$default"; return 0; }
    die "no answer for $var: give it in the answers file (--answers)"
  fi
  [[ -z "$explanation" ]] || printf '\n%s\n' "$explanation" >/dev/tty
  printf '%s%s: ' "$question" "${default:+ [$default]}" >/dev/tty
  IFS= read -r reply </dev/tty
  printf -v "$var" '%s' "${reply:-$default}"
}

# ask_optional VAR "question" [explanation]: like ask, but an empty answer is a valid "none".
ask_optional() {
  local var="$1" question="$2" explanation="${3:-}" reply
  [[ -n "${!var+set}" ]] && return 0
  if ! have_tty || [[ "${UNATTENDED:-no}" == yes ]]; then
    printf -v "$var" '%s' ''
    return 0
  fi
  [[ -z "$explanation" ]] || printf '\n%s\n' "$explanation" >/dev/tty
  printf '%s (empty: none): ' "$question" >/dev/tty
  IFS= read -r reply </dev/tty
  printf -v "$var" '%s' "$reply"
}

# read_masked VAR "prompt": one line from the terminal, echoed as one * per character;
# backspace and Ctrl-U work. It reads byte by byte in the C locale, whatever the server's locale
# is, so a character of several UTF-8 bytes gets one * and one backspace removes all of it.
read_masked() {
  local var="$1" prompt="$2" LC_ALL=C reply="" char saved
  saved="$(stty -g </dev/tty)"
  # Echo and line editing off before the prompt shows: what is typed right after it (or
  # pasted) must neither appear in clear nor be edited by the terminal before it is read.
  # Ctrl-C gives the terminal back as it was.
  stty -echo -icanon min 1 time 0 </dev/tty
  trap 'stty "$saved" </dev/tty; exit 130' INT TERM
  printf '%s: ' "$prompt" >/dev/tty
  while true; do
    # -d '': Enter arrives as a character of its own. A closed terminal ends the run.
    if ! IFS= read -rsn1 -d '' char </dev/tty; then
      stty "$saved" </dev/tty
      die "the terminal closed while a secret was typed"
    fi
    case "$char" in
      $'\n' | $'\r') break ;;
      $'\x7f' | $'\b')
        [[ -n "$reply" ]] || continue
        while [[ "$reply" == *[$'\x80'-$'\xbf'] ]]; do reply="${reply%?}"; done
        reply="${reply%?}"
        printf '\b \b' >/dev/tty
        ;;
      $'\x15') # Ctrl-U: the whole line
        while [[ -n "$reply" ]]; do
          [[ "$reply" == *[$'\x80'-$'\xbf'] ]] || printf '\b \b' >/dev/tty
          reply="${reply%?}"
        done
        ;;
      *)
        reply+="$char"
        # A UTF-8 continuation byte belongs to the character already shown as *.
        [[ "$char" == [$'\x80'-$'\xbf'] ]] || printf '*' >/dev/tty
        ;;
    esac
  done
  stty "$saved" </dev/tty
  trap - INT TERM
  printf '\n' >/dev/tty
  printf -v "$var" '%s' "$reply"
}

# ask_secret VAR "question": read from the terminal, never from a file or flag; the screen shows
# only one * per character (read_masked).
ask_secret() {
  local var="$1" question="$2"
  have_tty || die "$question needs a terminal (run the installer interactively)"
  read_masked "$var" "$question"
}

# run_step "what" COMMAND...: a long step (apt, Docker, a wait) with its output kept aside, so
# the screen gets the installer's own lines instead of pages of apt or Docker. While it runs
# longer than 15 s, a "still working" line every 20 s shows it has not hung. On failure the end
# of its output is shown and its exit status returned; the caller stops through die.
run_step() {
  local what="$1" log pid status=0 start="$SECONDS" next=15 elapsed
  shift
  log="$(mktemp)"
  # "|| exit": in the background subshell a failing command must not fire the ERR trap (it
  # would stop the run before the output is shown).
  { "$@" >"$log" 2>&1 || exit "$?"; } &
  pid=$!
  # Background commands ignore Ctrl-C in a script; stop the step along with the run.
  trap 'kill -TERM "$pid" 2>/dev/null; die "interrupted during: $what"' INT TERM
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    elapsed=$((SECONDS - start))
    if ((elapsed >= next)); then
      say "  still working ($((elapsed / 60)):$(printf '%02d' $((elapsed % 60)))): $what"
      next=$((next + 20))
    fi
  done
  wait "$pid" || status=$?
  trap - INT TERM
  if ((status != 0)); then
    warn "$what failed; the end of its output:"
    tail -n 25 "$log" | sed 's/^/[install]   | /' >&2
  fi
  rm -f "$log"
  return "$status"
}

# retry TRIES SECONDS COMMAND...: true as soon as COMMAND succeeds; tries TRIES times, SECONDS
# apart (a wait for a service, run under run_step so it is never silent).
retry() {
  local tries="$1" pause="$2"
  shift 2
  until "$@"; do
    ((--tries > 0)) || return 1
    sleep "$pause"
  done
}

# Reads KEY=VALUE lines into variables, only for the keys listed: a file is data, never code.
# Blank lines and # comments are skipped; surrounding quotes are removed.
read_kv_file() {
  local file="$1" line key value
  shift
  [[ -r "$file" ]] || die "cannot read $file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || die "$file: not KEY=VALUE: $line"
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    value="${value#\"}" && value="${value%\"}"
    value="${value#\'}" && value="${value%\'}"
    if [[ " $* " == *" $key "* ]]; then
      printf -v "$key" '%s' "$value"
    else
      die "$file: unknown key $key"
    fi
  done <"$file"
}

# kv_get FILE KEY: the value of KEY in a KEY=VALUE file, or empty.
kv_get() {
  [[ -f "$1" ]] || return 0
  sed -n "s/^$2=//p" "$1" | tail -n 1
}

# kv_set FILE KEY VALUE: replaces KEY's line or appends it; the file stays mode 600.
kv_set() {
  local file="$1" key="$2" value="$3" tmp
  [[ -f "$file" ]] || install -m 600 /dev/null "$file"
  tmp="$(mktemp "$file.XXXXXX")"
  grep -v "^$key=" "$file" >"$tmp" || true
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}

# kv_unset FILE KEY: removes KEY's line (e.g. BOOTSTRAP_TOKEN once the first admin exists).
kv_unset() {
  local file="$1" key="$2" tmp
  [[ -f "$file" ]] || return 0
  tmp="$(mktemp "$file.XXXXXX")"
  grep -v "^$key=" "$file" >"$tmp" || true
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}

# A random secret, never printed: hex (default) or base64 of 32 random bytes.
new_secret() {
  if [[ "${1:-hex}" == base64 ]]; then openssl rand -base64 32; else openssl rand -hex 32; fi
}

# The answers the installer remembers (no secrets): written after every successful step.
STATE_KEYS="MODE SITE_DOMAIN WWW_REDIRECT CALLS_DOMAIN RECORDING ACME_EMAIL ADMIN_NAME
ADMIN_EMAIL PRICE_BOT_DB PRICE_BOT_MINING_RATES EVENT_BOT_DB BACKUP_RECIPIENT ACME_SERVER
ACME_CA_BUNDLE ADMIN_DONE INSTALL_DIR NGINX_CONF_STYLE"

save_state() {
  local key
  install -d -m 700 "$STATE_DIR"
  for key in $STATE_KEYS; do
    kv_set "$STATE_FILE" "$key" "${!key:-}"
  done
}

load_state() {
  local key
  [[ -f "$STATE_FILE" ]] || return 0
  for key in $STATE_KEYS; do
    # An answers file or a flag given now wins over what was remembered.
    [[ -n "${!key:-}" ]] || printf -v "$key" '%s' "$(kv_get "$STATE_FILE" "$key")"
  done
}
