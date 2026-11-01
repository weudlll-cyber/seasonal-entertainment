# shellcheck shell=bash
# ============================================================
# File:        common.sh
# Path:        deploy/install/lib/common.sh
# Project:     Seasonal Entertainment
# Description: The installer's shared helpers (deploy/install.sh, docs/DEPLOYMENT.md): one-line
#              messages, stopping with a reason and the rollback command, questions on the
#              terminal (silent ones for secrets), KEY=VALUE files read without executing them
#              and edited key by key, and the installer's own state in /etc/seasonal/.
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

# ask VAR "question" [default]: keeps VAR when it already has a value (answers file, state).
ask() {
  local var="$1" question="$2" default="${3:-}" reply
  [[ -n "${!var:-}" ]] && return 0
  if ! have_tty || [[ "${UNATTENDED:-no}" == yes ]]; then
    [[ -n "$default" ]] && { printf -v "$var" '%s' "$default"; return 0; }
    die "no answer for $var: give it in the answers file (--answers)"
  fi
  printf '%s%s: ' "$question" "${default:+ [$default]}" >/dev/tty
  IFS= read -r reply </dev/tty
  printf -v "$var" '%s' "${reply:-$default}"
}

# ask_optional VAR "question": like ask, but an empty answer is a valid "none".
ask_optional() {
  local var="$1" question="$2" reply
  [[ -n "${!var+set}" ]] && return 0
  if ! have_tty || [[ "${UNATTENDED:-no}" == yes ]]; then
    printf -v "$var" '%s' ''
    return 0
  fi
  printf '%s (empty: none): ' "$question" >/dev/tty
  IFS= read -r reply </dev/tty
  printf -v "$var" '%s' "$reply"
}

# ask_secret VAR "question": read from the terminal without echo; never from a file or flag.
ask_secret() {
  local var="$1" question="$2" reply
  have_tty || die "$question needs a terminal (run the installer interactively)"
  printf '%s: ' "$question" >/dev/tty
  IFS= read -rs reply </dev/tty
  printf '\n' >/dev/tty
  printf -v "$var" '%s' "$reply"
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
