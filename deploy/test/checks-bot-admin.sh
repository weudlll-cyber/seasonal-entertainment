# shellcheck shell=bash
# ============================================================
# File:        checks-bot-admin.sh
# Path:        deploy/test/checks-bot-admin.sh
# Project:     Seasonal Entertainment
# Description: The installer tests' checks for the event bot's admin page inside the site
#              (docs/DEPLOYMENT.md, "The event bot's admin page"), sourced by checks.sh for every
#              check named bot-admin-*, whose pass, fail, pebble_root and kv it uses. They talk
#              to https://example.org as a browser would (logged in through the site's own API
#              with a cookie jar: the test admin, with 2FA set up on the first login, and a
#              member registered here) and read what the stub bot (stub-bot.py) recorded. The
#              bot's token is read from the test bot's env file and compared, never printed.
# ============================================================

SITE=https://example.org
BOT_DIR="$TEST_DIR/bot-admin"
ADMIN_JAR="$BOT_DIR/admin.jar"
MEMBER_JAR="$BOT_DIR/member.jar"
# Every answer the checks got (headers and body), searched for the token by bot-admin-secret.
RESPONSES="$BOT_DIR/responses"
LAST_BODY="$BOT_DIR/last-body"
STUB_LOG=/var/log/stub-bot/requests.jsonl
TOKEN_CONF=/etc/seasonal/bot-admin-token.conf
SITE_CONF=/etc/nginx/sites-available/zz-seasonal-site.conf
install -d -m 700 "$BOT_DIR"

bot_token() { sed -n 's/^STANNOUNCEBOT_WEB_ADMIN_TOKEN=//p' /etc/test-bot.env; }

# json FIELD: one field of the JSON object on stdin, empty when missing (python3: ufw's).
json() { python3 -I -c 'import json, sys; v = json.load(sys.stdin).get(sys.argv[1]); print("" if v is None else v)' "$1"; }

# in_site SCRIPT [ARGS]: an ES module in the site container, for the site's own crypto
# (the key a browser derives from a password) and TOTP code; stdin is passed on.
in_site() { docker exec -i -w /app seasonal-site-site-1 node --input-type=module -e "$@"; }
new_salt() { in_site "import { newSalt } from '@seasonal-entertainment/shared/crypto.js'; console.log(await newSalt());"; }
auth_key() {
  in_site "import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
    let password = ''; for await (const chunk of process.stdin) password += chunk;
    console.log((await deriveAccountKeys(password, process.argv[1])).authKey);" "$1"
}
totp() {
  in_site "import { codeForStep, stepAt } from '/app/server/src/twofa/totp.js';
    console.log(codeForStep(process.argv[1], stepAt(Date.now())));" "$(cat "$BOT_DIR/admin-totp")"
}

# api JAR METHOD PATH [JSON]: the site's API from this site's own origin, as its pages call it.
api() {
  local data=()
  [[ -z "${4:-}" ]] || data=(--data "$4")
  curl -sS --max-time 30 --cacert "$ROOT_CA" -b "$1" -c "$1" -X "$2" -H 'Content-Type: application/json' \
    -H "Origin: $SITE" "${data[@]}" "$SITE/api$3"
}

# login NAME PASSWORD JAR: a fresh session in JAR (the second factor when the account has
# one; a code is taken once, so a refused one is tried again in the next 30-second step).
# Sets AUTH_KEY (not printed: a failure must reach the output as a FAIL line).
login() {
  local name="$1" password="$2" jar="$3" salt answer tries=2
  rm -f "$jar"
  salt="$(api "$jar" POST /auth/prelogin "{\"username\":\"$name\"}" | json salt)"
  AUTH_KEY="$(printf '%s' "$password" | auth_key "$salt")"
  answer="$(api "$jar" POST /auth/login "{\"username\":\"$name\",\"authKey\":\"$AUTH_KEY\"}")"
  while [[ "$(json twoFactorRequired <<<"$answer")" == True ]] && ((tries-- > 0)); do
    answer="$(api "$jar" POST /2fa/login "{\"code\":\"$(totp)\"}")"
    [[ "$(json ok <<<"$answer")" == True ]] || { answer='{"twoFactorRequired":true}'; sleep 30; }
  done
  [[ "$(json ok <<<"$answer")" == True ]] || fail bot-admin-login "$name could not log in: $(json message <<<"$answer")"
}

# The test admin needs 2FA for any staff action: set up on its first login (the secret kept
# in the test's folder for the next logins).
admin_login() {
  local secret answer
  login admin "${TEST_ADMIN_PASSWORD:?the test admin password}" "$ADMIN_JAR"
  [[ ! -s "$BOT_DIR/admin-totp" ]] || return 0
  secret="$(api "$ADMIN_JAR" POST /2fa/setup "{\"authKey\":\"$AUTH_KEY\"}" | json secret)"
  [[ -n "$secret" ]] || fail bot-admin-login "2FA setup for the admin gave no secret"
  (umask 077 && echo "$secret" >"$BOT_DIR/admin-totp")
  answer="$(api "$ADMIN_JAR" POST /2fa/enable "{\"code\":\"$(totp)\"}")"
  [[ "$(json ok <<<"$answer")" == True ]] || fail bot-admin-login "2FA enable: $(json message <<<"$answer")"
}

# A member (no staff role), registered on the first call.
member_login() {
  local password salt key answer
  if [[ -s "$BOT_DIR/member-password" ]]; then
    login member1 "$(cat "$BOT_DIR/member-password")" "$MEMBER_JAR"
    return 0
  fi
  password="member-$(openssl rand -hex 8)"
  (umask 077 && echo "$password" >"$BOT_DIR/member-password")
  salt="$(new_salt)"
  key="$(printf '%s' "$password" | auth_key "$salt")"
  answer="$(api "$MEMBER_JAR" POST /auth/register "{\"username\":\"member1\",\"email\":\"member1@example.org\",\"salt\":\"$salt\",\"authKey\":\"$key\",\"ageConfirmed\":true}")"
  [[ "$(json ok <<<"$answer")" == True ]] || fail bot-admin-login "member registration: $(json message <<<"$answer")"
}

# bot_request JAR METHOD PATH [curl options]: one request to the bot's page as a browser sends
# it (JAR /dev/null: a guest); prints the status, keeps the body in LAST_BODY.
bot_request() {
  local jar="$1" method="$2" path="$3" head
  shift 3
  head="$(mktemp)"
  curl -sS --max-time 30 --cacert "$ROOT_CA" -b "$jar" -X "$method" -D "$head" -o "$LAST_BODY" \
    -w '%{http_code}' "$@" "$SITE$path"
  cat "$head" "$LAST_BODY" >>"$RESPONSES"
  rm -f "$head"
}

# What the stub bot recorded: how many requests, and of the last one a field or a header's
# values (one per line; a header sent twice shows twice).
stub_count() { if [[ -f "$STUB_LOG" ]]; then wc -l <"$STUB_LOG"; else echo 0; fi; }
stub_last() { tail -n 1 "$STUB_LOG" | python3 -I -c 'import json, sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }
stub_header() {
  tail -n 1 "$STUB_LOG" | python3 -I -c 'import json, sys
for value in json.load(sys.stdin)["headers"].get(sys.argv[1], []): print(value)' "$1"
}

# The site's audit log: how many entries, and who made the newest.
audit() {
  docker exec -w /app seasonal-site-site-1 node --input-type=commonjs -e "
    const db = new (require('better-sqlite3'))('/data/seasonal.db', { readonly: true });
    console.log(db.prepare('$1').pluck().get());"
}
audit_count() { audit 'SELECT count(*) FROM audit_log'; }
audit_newest_actor() { audit 'SELECT actor_name FROM audit_log ORDER BY id DESC LIMIT 1'; }

# The last request reached the bot with its token (exactly once) and the admin as acting user.
bot_got_admin() {
  [[ "$(stub_header x-bot-admin-token)" == "$(bot_token)" ]] || fail "$1" "the bot did not get its own token, exactly once"
  [[ "$(stub_header x-acting-user)" == admin ]] || fail "$1" "the bot got X-Acting-User '$(stub_header x-acting-user | paste -sd ,)', not admin"
}

# shellcheck disable=SC2154 # check: the name checks.sh was called with
case "$check" in
  bot-admin-login)
    admin_login
    member_login
    pass "logged in through the site's API: the admin (2FA) and a member"
    ;;
  bot-admin-page)
    before="$(stub_count)"
    code="$(bot_request "$ADMIN_JAR" GET /bot-admin/)"
    if [[ "$code" != 200 ]] || ! grep -q 'stub bot admin page' "$LAST_BODY"; then
      fail bot-admin-page "the admin got $code, not the bot's page"
    fi
    [[ "$(stub_count)" == $((before + 1)) && "$(stub_last path)" == /bot-admin/ ]] || fail bot-admin-page "the bot did not get exactly that request"
    bot_got_admin bot-admin-page
    pass "an admin gets the bot's page at /bot-admin/ (200); the bot got its token and X-Acting-User: admin"
    ;;
  bot-admin-refused)
    before="$(stub_count)"
    guest="$(bot_request /dev/null GET /bot-admin/)"
    health="$(bot_request /dev/null GET /bot-admin/health)"
    forged="$(bot_request /dev/null GET /bot-admin/api/events -H 'X-Bot-Admin-Token: guessed' -H 'X-Acting-User: admin')"
    member="$(bot_request "$MEMBER_JAR" GET /bot-admin/)"
    [[ "$guest $health $forged $member" == '401 401 401 403' ]] ||
      fail bot-admin-refused "guest $guest, guest health $health, guest with forged headers $forged, member $member (expected 401 401 401 403)"
    [[ "$(stub_count)" == "$before" ]] || fail bot-admin-refused "the bot got $(($(stub_count) - before)) of these requests"
    pass "guests get 401 (also with a forged token and acting user), a member 403, at nginx: the bot saw none of them"
    ;;
  bot-admin-headers)
    code="$(bot_request "$ADMIN_JAR" GET /bot-admin/api/whoami -H 'X-Bot-Admin-Token: forged-by-the-browser' \
      -H 'X-Acting-User: mallory' -H 'X-Forwarded-For: 203.0.113.9')"
    [[ "$code" == 200 ]] || fail bot-admin-headers "the admin got $code"
    bot_got_admin bot-admin-headers
    [[ -z "$(stub_header x-forwarded-for)" ]] || fail bot-admin-headers "the browser's X-Forwarded-For reached the bot"
    # The admin's jar holds the site's session cookie: neither it nor any other reaches the bot.
    [[ -z "$(stub_header cookie)" ]] || fail bot-admin-headers "the browser's Cookie header reached the bot"
    pass "the browser's own X-Bot-Admin-Token, X-Acting-User, X-Forwarded-For and Cookie never reach the bot (replaced or dropped)"
    ;;
  bot-admin-post)
    audits="$(audit_count)"
    before="$(stub_count)"
    cross="$(bot_request "$ADMIN_JAR" POST /bot-admin/api/events -H 'Origin: https://evil.example' \
      -H 'Content-Type: application/json' --data '{"name":"cross-origin"}')"
    [[ "$cross" == 403 && "$(stub_count)" == "$before" && "$(audit_count)" == "$audits" ]] ||
      fail bot-admin-post "a cross-origin POST got $cross, reached the bot $(($(stub_count) - before)) times, $(($(audit_count) - audits)) audit entries"
    same="$(bot_request "$ADMIN_JAR" POST /bot-admin/api/events -H "Origin: $SITE" \
      -H 'Content-Type: application/json' --data '{"name":"same-origin"}')"
    [[ "$same" == 200 && "$(stub_count)" == $((before + 1)) && "$(stub_last method)" == POST ]] ||
      fail bot-admin-post "a same-origin POST got $same and did not reach the bot once"
    bot_got_admin bot-admin-post
    [[ "$(audit_count)" == $((audits + 1)) && "$(audit_newest_actor)" == admin ]] ||
      fail bot-admin-post "$(($(audit_count) - audits)) audit entries for it (newest by '$(audit_newest_actor)'), expected one by admin"
    pass "a cross-origin POST is refused (403, not at the bot); a same-origin POST passes with one audit entry by admin"
    ;;
  bot-admin-secret)
    token="$(bot_token)"
    [[ "$(stat -c '%a %U %G' "$TOKEN_CONF")" == '600 root root' ]] || fail bot-admin-secret "$TOKEN_CONF is $(stat -c '%a %U %G' "$TOKEN_CONF")"
    # Without the token in the include, every search below would pass for nothing.
    grep -qF -e "$token" "$TOKEN_CONF" || fail bot-admin-secret "the include does not hold the bot's token"
    for place in /var/log/nginx/* "$RESPONSES" "$SITE_DIR/site.env" /etc/seasonal/install.conf "$SITE_CONF" /var/backups/seasonal-install/*/*; do
      [[ -f "$place" ]] || continue
      if [[ "$place" == *.tar.gz ]]; then
        ! tar -xzOf "$place" | grep -qF -e "$token" || fail bot-admin-secret "the token is in $place"
      else
        ! grep -qF -e "$token" "$place" || fail bot-admin-secret "the token is in $place"
      fi
    done
    ! docker exec seasonal-site-site-1 env | grep -qF -e "$token" || fail bot-admin-secret "the token is in the site container's environment"
    ! docker logs seasonal-site-site-1 2>&1 | grep -qF -e "$token" || fail bot-admin-secret "the token is in the site container's log"
    pass "the token is only in $TOKEN_CONF (600 root): not in nginx's logs, answers, site.env, the state, the site file, the snapshots, the site container's env or log"
    ;;
  bot-admin-output)
    # stdin: the installer runs' output, as run.sh collected it.
    ! grep -qF -e "$(bot_token)" || fail bot-admin-output "the token is in the installer's output"
    pass "the token never shows in the installer's output"
    ;;
  bot-admin-absent)
    # Not set up (any argument: also remembered as "none").
    [[ ! -e "$TOKEN_CONF" ]] || fail bot-admin-absent "$TOKEN_CONF is there"
    ! grep -qs 'bot-admin' "$SITE_CONF" || fail bot-admin-absent "the site's nginx file has the bot's locations"
    [[ -z "$(kv "$SITE_DIR/site.env" BOT_ADMIN_EMBEDDED)" ]] || fail bot-admin-absent "site.env has BOT_ADMIN_EMBEDDED"
    [[ -z "${1:-}" || "$(kv /etc/seasonal/install.conf BOT_ADMIN_URL)" == "$1" ]] ||
      fail bot-admin-absent "remembered: BOT_ADMIN_URL=$(kv /etc/seasonal/install.conf BOT_ADMIN_URL)"
    pass "the bot's admin page is not set up${1:+ (remembered: $1)}: no locations, no token include, no BOT_ADMIN_EMBEDDED"
    ;;
  *)
    fail "$check" "unknown check"
    ;;
esac
