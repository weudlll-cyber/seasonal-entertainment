#!/bin/bash
# ============================================================
# File:        bot-admin-token.test.sh
# Path:        deploy/test/bot-admin-token.test.sh
# Project:     Seasonal Entertainment
# Description: Tests of how the installer takes the event bot's admin token (docs/DEPLOYMENT.md,
#              "The event bot's admin page"): read_kv_key (deploy/install/lib/common.sh) must
#              read a bot's env file as systemd's EnvironmentFile= does, since the bot compares
#              against that value (quotes, escapes, a CRLF file, spaces around =, an ignored
#              export line, a # inside the value, trailing spaces, a repeated key; an unclosed
#              quote stops the run; every case checked once against systemd 255), and
#              bot_admin_token_check (deploy/install/lib/bot-admin.sh) must pass every token
#              nginx can carry between double quotes and refuse only $ " \, control and
#              non-ASCII characters, spaces at an end and more than 1024 characters, saying
#              how to replace the token and never showing it. Plain checks, no framework; no
#              root needed. Run: bash deploy/test/bot-admin-token.test.sh; CI runs it. Exit
#              code 1 on any failure.
# ============================================================

# The cases hold $, \ and ` literally, between single quotes on purpose.
# shellcheck disable=SC1003,SC2016

set -u

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../install/lib" && pwd)"
# shellcheck source=SCRIPTDIR/../install/lib/common.sh
source "$LIB/common.sh"
# shellcheck source=SCRIPTDIR/../install/lib/bot-admin.sh
source "$LIB/bot-admin.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; failures=$((failures + 1)); }

KEY=STANNOUNCEBOT_WEB_ADMIN_TOKEN

# reads WHAT EXPECTED CONTENT: an env file with CONTENT (printf format, so \r and \n are
# written as such) must give EXPECTED for KEY.
reads() {
  local what="$1" expected="$2" got value
  # shellcheck disable=SC2059 # the content is the format on purpose
  printf "$3" >"$work/env"
  got="$(read_kv_key "$work/env" "$KEY" value && printf '%s' "$value")"
  if [[ "$got" == "$expected" ]]; then ok "reads $what"; else bad "reads $what: got [$got], expected [$expected]"; fi
}

reads 'a plain value' 'abc123' "# the bot\nOTHER=x\n$KEY=abc123\n"
reads 'a double-quoted value' 'abc 123' "$KEY=\"abc 123\"\n"
reads 'a single-quoted value' 'a"b\$c' "$KEY='a\"b\\\\\$c'\n"
reads 'a CRLF file' 'abc123' "OTHER=x\r\n$KEY=abc123\r\nLAST=y\r\n"
reads 'a quoted value in a CRLF file' 'abc 123' "$KEY=\"abc 123\"\r\n"
reads 'spaces around =' 'abc123' "  $KEY = abc123\n"
reads 'an export line ignored, as systemd does' 'abc' "$KEY=abc\nexport $KEY=other\n"
reads 'spaces after an unquoted value dropped' 'abc 123' "$KEY=abc 123   \n"
reads 'a space at the end inside quotes kept' 'abc ' "$KEY=\"abc \"\n"
reads 'a # inside the value' 'abc#1 #2' "$KEY=abc#1 #2\n"
reads 'escapes inside double quotes' 'a"b\c$d`e\nf' "$KEY=\"a\\\\\"b\\\\\\\\c\\\\\$d\\\\\`e\\\\nf\"\n"
reads 'an escape outside quotes' 'a b' "$KEY=a\\\\ b\n"
reads 'quoted and unquoted parts joined' 'abc def' "$KEY=\"abc\"' def'\n"
reads 'the last of a repeated key' 'second' "$KEY=first\n$KEY=second\n"
reads 'a longer key of the same start ignored' 'abc' "${KEY}_OLD=old\n$KEY=abc\n"
reads 'a missing key as empty' '' "OTHER=x\n"
reads 'a file without a last newline' 'abc' "$KEY=abc"

printf '%s="abc\n' "$KEY" >"$work/env"
if (read_kv_key "$work/env" "$KEY" value) 2>"$work/err"; then
  bad 'an unclosed quote stops the run'
elif grep -q 'unclosed quote' "$work/err" && ! grep -q abc "$work/err"; then
  ok 'an unclosed quote stops the run, without showing the value'
else
  bad "an unclosed quote: $(cat "$work/err")"
fi

# passes WHAT TOKEN / refused WHAT TOKEN REASON: bot_admin_token_check in a subshell (die exits).
passes() {
  if (BOT_ADMIN_TOKEN="$2" bot_admin_token_check) 2>"$work/err"; then ok "passes $1"; else bad "passes $1: $(cat "$work/err")"; fi
}
refused() {
  if (BOT_ADMIN_TOKEN="$2" BOT_ADMIN_TOKEN_KEY=$KEY BOT_ADMIN_TOKEN_FILE=/etc/bot.env bot_admin_token_check) 2>"$work/err"; then
    bad "refuses $1"
  elif ! grep -qF -- "$3" "$work/err"; then
    bad "refuses $1: no '$3' in: $(cat "$work/err")"
  elif ! grep -qF "openssl rand -hex 32" "$work/err" || ! grep -qF "$KEY in /etc/bot.env" "$work/err"; then
    bad "refuses $1: does not say how to replace the token"
  elif grep -qF -- "$2" "$work/err"; then
    bad "refuses $1: the message shows the token"
  else
    ok "refuses $1"
  fi
}

passes 'letters, digits and . _ ~ + / = -' 'Ab3.d_e~f+g/h=i-j'
passes 'other punctuation, nginx-special ones included' "Tok!@%^&*()[]{};:'#,<>?|\`en"
passes 'a space inside' 'two words'
passes '1024 characters' "$(printf 'a%.0s' $(seq 1024))"
refused 'a $' 'tok$en' 'holds $, " or \'
refused 'a "' 'tok"en' 'holds $, " or \'
refused 'a \' 'tok\en' 'holds $, " or \'
refused 'a tab' "$(printf 'tok\ten')" 'control characters'
refused 'a newline' "$(printf 'Qz\nQz')" 'control characters'
refused 'a non-ASCII character' 'tökenvalue' 'outside ASCII'
refused 'a space at the start' ' tokenvalue' 'starts or ends with a space'
refused 'a space at the end' 'tokenvalue ' 'starts or ends with a space'
refused '1025 characters' "$(printf 'a%.0s' $(seq 1025))" 'longer than 1024'

if ((failures)); then
  echo "$failures failed"
  exit 1
fi
echo "all passed"
