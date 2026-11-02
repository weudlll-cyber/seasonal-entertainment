# shellcheck shell=bash
# ============================================================
# File:        bot-admin.sh
# Path:        deploy/install/lib/bot-admin.sh
# Project:     Seasonal Entertainment
# Description: The event bot's admin page inside the site (docs/DEPLOYMENT.md, "The event
#              bot's admin page"; nginx mode only): the question for the bot's local address
#              (an empty answer is remembered as "none"), its admin token read from one key of
#              the bot's own env file or typed hidden, never printed or stored in the state,
#              written only into the root-only nginx include /etc/seasonal/bot-admin-token.conf;
#              the nginx locations that ask the site (GET /api/bot-admin/authorize) about every
#              request before forwarding it to the bot with the token and the acting user's
#              name; the matching include after --rollback, its removal by --uninstall, and
#              the line in --status.
# ============================================================

BOT_ADMIN_TOKEN_CONF="$STATE_DIR/bot-admin-token.conf"
BOT_ADMIN_DEFAULT_URL=http://127.0.0.1:8090
BOT_ADMIN_DEFAULT_KEY=STANNOUNCEBOT_WEB_ADMIN_TOKEN

# Shown before the question, only when it is really asked.
bot_admin_explanation() {
  cat <<EOF
The owner's own event bot (stannouncebot) has an admin page for its events. If that bot runs
on this server, the page can be shown inside the site at https://$SITE_DOMAIN/bot-admin/ for
organisers and admins, with their site login (no second login). It needs the bot's admin page
address on this server (http://127.0.0.1:<port>) and the bot's admin token, which is read from
the bot's env file or typed (never shown or stored by the installer outside nginx's own file).
Not running that bot here? Leave it empty: it is not asked again (later: --bot-admin).
EOF
}

# true when this run embeds the bot's admin page.
bot_admin_on() {
  [[ "${MODE:-}" == nginx && -n "${BOT_ADMIN_URL:-}" && "$BOT_ADMIN_URL" != none ]]
}

# BOT_ADMIN_TOKEN from the key BOT_ADMIN_TOKEN_KEY of the file BOT_ADMIN_TOKEN_FILE (read_kv_key:
# that key only, the file never executed), or stops.
bot_admin_token_from_file() {
  BOT_ADMIN_TOKEN_KEY="${BOT_ADMIN_TOKEN_KEY:-$BOT_ADMIN_DEFAULT_KEY}"
  [[ "$BOT_ADMIN_TOKEN_KEY" =~ ^[A-Z_][A-Z0-9_]*$ ]] || die "BOT_ADMIN_TOKEN_KEY is not a KEY name: $BOT_ADMIN_TOKEN_KEY"
  [[ -f "$BOT_ADMIN_TOKEN_FILE" ]] || die "no such file: $BOT_ADMIN_TOKEN_FILE (BOT_ADMIN_TOKEN_FILE)"
  read_kv_key "$BOT_ADMIN_TOKEN_FILE" "$BOT_ADMIN_TOKEN_KEY" BOT_ADMIN_TOKEN
  [[ -n "$BOT_ADMIN_TOKEN" ]] || die "$BOT_ADMIN_TOKEN_FILE has no value for $BOT_ADMIN_TOKEN_KEY"
}

# The token goes into nginx's configuration between double quotes, where any printable ASCII
# character is taken as it is (; { } # ' and spaces included) except " (ends the string), $ (a
# variable) and \ (an escape). Control characters cannot be in a header; other bytes (non-ASCII)
# or spaces at either end would reach the bot changed (decoded as Latin-1, trimmed), so its
# comparison would fail. Any of those: the bot's token has to be replaced.
bot_admin_token_check() {
  local LC_ALL=C why="" i code
  if ((${#BOT_ADMIN_TOKEN} > 1024)); then
    why="is longer than 1024 characters"
  elif [[ "$BOT_ADMIN_TOKEN" == *[\$\"\\]* ]]; then
    why='holds $, " or \, which nginx cannot pass on as they are'
  elif [[ "$BOT_ADMIN_TOKEN" == " "* || "$BOT_ADMIN_TOKEN" == *" " ]]; then
    why="starts or ends with a space"
  fi
  # Byte by byte (LC_ALL=C): character classes differ between platforms' regex libraries.
  for ((i = 0; i < ${#BOT_ADMIN_TOKEN} && ${#why} == 0; i++)); do
    printf -v code '%d' "'${BOT_ADMIN_TOKEN:i:1}"
    ((code >= 32 && code <= 126)) || why="holds control characters or characters outside ASCII"
  done
  [[ -z "$why" ]] && return 0
  die "the bot's admin token $why: it is not written into nginx's configuration; nothing was changed.
  Give the bot a new token made of letters and digits, for example the output of
  'openssl rand -hex 32', as ${BOT_ADMIN_TOKEN_KEY:-its admin token} in ${BOT_ADMIN_TOKEN_FILE:-its env file}, restart the bot,
  then run this installer again (docs/DEPLOYMENT.md, \"The event bot's admin page\")"
}

# The question, on a terminal: the address ("yes" for the usual one, empty for none), then
# where the token comes from. Every answer of an earlier run is asked again.
bot_admin_question() {
  unset BOT_ADMIN_URL
  ask_optional BOT_ADMIN_URL "The event bot's admin page to embed: its address on this server, or yes for $BOT_ADMIN_DEFAULT_URL" \
    "$(bot_admin_explanation)"
  [[ "$BOT_ADMIN_URL" != yes ]] || BOT_ADMIN_URL="$BOT_ADMIN_DEFAULT_URL"
  BOT_ADMIN_TOKEN_KEY=""
  if [[ -z "$BOT_ADMIN_URL" ]]; then
    BOT_ADMIN_URL=none
    BOT_ADMIN_TOKEN_FILE=""
    return 0
  fi
  unset BOT_ADMIN_TOKEN_FILE
  ask_optional BOT_ADMIN_TOKEN_FILE "The bot's env file that holds its admin token (KEY=VALUE lines; empty to type the token instead)"
  if [[ -n "$BOT_ADMIN_TOKEN_FILE" ]]; then
    ask BOT_ADMIN_TOKEN_KEY "The key of the token in that file" "$BOT_ADMIN_DEFAULT_KEY"
  else
    ask_secret BOT_ADMIN_TOKEN "The bot's admin token (shown as *)"
  fi
}

# After decide_mode, before anything changes: the answers for the bot's admin page, checked,
# and its token in BOT_ADMIN_TOKEN (memory only; empty when a typed token of an earlier run
# stays in the include file). Asked on a terminal while never answered, or with --bot-admin
# (BOT_ADMIN_REASK, gather_answers); an unattended run asks nothing and remembers nothing.
ask_bot_admin() {
  BOT_ADMIN_TOKEN=""
  if [[ "$MODE" != nginx ]]; then
    [[ "${ASK_BOT_ADMIN:-no}" == no ]] || die "--bot-admin: the event bot's admin page can be embedded in nginx mode only (docs/DEPLOYMENT.md)"
    say "the event bot's admin page: nginx mode only, not set up here (docs/DEPLOYMENT.md, \"The event bot's admin page\")"
    BOT_ADMIN_URL="" BOT_ADMIN_TOKEN_FILE="" BOT_ADMIN_TOKEN_KEY=""
    return 0
  fi
  [[ "${BOT_ADMIN_REASK:-no}" == no ]] || BOT_ADMIN_URL=""
  if [[ -z "${BOT_ADMIN_URL:-}" && "$UNATTENDED" == no ]] && have_tty; then
    bot_admin_question
  fi
  [[ "${ASK_BOT_ADMIN:-no}" == no || -n "${BOT_ADMIN_URL:-}" ]] || die "--bot-admin needs a terminal"
  [[ "${BOT_ADMIN_URL:-}" != yes ]] || BOT_ADMIN_URL="$BOT_ADMIN_DEFAULT_URL"
  if ! bot_admin_on; then
    [[ "${BOT_ADMIN_URL:-}" != none ]] || BOT_ADMIN_TOKEN_FILE="" BOT_ADMIN_TOKEN_KEY=""
    return 0
  fi
  BOT_ADMIN_URL="${BOT_ADMIN_URL%/}"
  # Loopback only: the bot takes its token only from this server itself, and nginx must not
  # be pointed anywhere else with it.
  local port_re='^http://(127\.0\.0\.1|\[::1\]):([0-9]{1,5})$'
  if ! [[ "$BOT_ADMIN_URL" =~ $port_re ]] || ((10#${BASH_REMATCH[2]} < 1 || 10#${BASH_REMATCH[2]} > 65535)); then
    die "BOT_ADMIN_URL must be http://127.0.0.1:<port> or http://[::1]:<port> (the bot's admin page on this server): $BOT_ADMIN_URL"
  fi
  if [[ -n "${BOT_ADMIN_TOKEN_FILE:-}" ]]; then
    bot_admin_token_from_file
  elif [[ -z "$BOT_ADMIN_TOKEN" ]]; then
    BOT_ADMIN_TOKEN_KEY=""
    # Typed on an earlier run: nginx's include keeps it.
    [[ -s "$BOT_ADMIN_TOKEN_CONF" ]] && return 0
    if [[ "$UNATTENDED" == yes ]] || ! have_tty; then
      die "no admin token for the event bot's page: give BOT_ADMIN_TOKEN_FILE (and BOT_ADMIN_TOKEN_KEY) in the answers file, or run with --bot-admin on a terminal"
    fi
    ask_secret BOT_ADMIN_TOKEN "The bot's admin token (shown as *)"
  fi
  bot_admin_token_check
}

# The include nginx reads the token from: root only, created with umask 077 and moved into
# place in one step, so it is never readable by others, not even half-written.
write_bot_admin_token() {
  local tmp
  install -d -m 700 "$STATE_DIR"
  tmp="$(umask 077 && mktemp "$BOT_ADMIN_TOKEN_CONF.XXXXXX")"
  {
    echo "# Written by deploy/install.sh: the event bot's admin token for nginx (root only)."
    printf 'proxy_set_header X-Bot-Admin-Token "%s";\n' "$BOT_ADMIN_TOKEN"
  } >"$tmp"
  chown root:root "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$BOT_ADMIN_TOKEN_CONF"
}

# setup_nginx, before the site's file: the token in place when the page is embedded.
bot_admin_before_nginx() {
  if bot_admin_on && [[ -n "${BOT_ADMIN_TOKEN:-}" ]]; then
    write_bot_admin_token
    say "the event bot's admin token: in $BOT_ADMIN_TOKEN_CONF (root only, never shown)"
  fi
  BOT_ADMIN_TOKEN=""
}

# setup_nginx, after the site's file: without the page no file of ours names the include, so
# it goes; with it, a hint when the bot does not answer under /bot-admin/ yet (its env file
# needs STANNOUNCEBOT_WEB_EMBEDDED=1 and STANNOUNCEBOT_WEB_BASE_PATH=/bot-admin).
bot_admin_after_nginx() {
  local code
  if ! bot_admin_on; then
    rm -f "$BOT_ADMIN_TOKEN_CONF"
    return 0
  fi
  say "the event bot's admin page: https://$SITE_DOMAIN/bot-admin/ (staff only) -> $BOT_ADMIN_URL"
  code="$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' "$BOT_ADMIN_URL/bot-admin/health" || true)"
  [[ "$code" == 2* ]] ||
    warn "the event bot does not answer on $BOT_ADMIN_URL/bot-admin/health (${code:-no answer}): set STANNOUNCEBOT_WEB_EMBEDDED=1 and STANNOUNCEBOT_WEB_BASE_PATH=/bot-admin in its env file and restart it"
}

# The site's server block, when the page is embedded (nginx_site_conf). A proxy_set_header in
# a location replaces every inherited one, so each location sets all the headers it needs.
nginx_bot_admin_locations() {
  echo "    # The event bot's admin page: for every request nginx first asks the site, with the"
  echo "    # visitor's cookie, whether this is staff (204 with X-Acting-User; 401/403 reach the"
  echo "    # visitor as they are); only then it goes to the bot, with the bot's token."
  echo "    location = /_seasonal_bot_admin_auth {"
  echo "        internal;"
  echo "        proxy_pass http://127.0.0.1:$SITE_LOCAL_PORT/api/bot-admin/authorize;"
  echo "        # A subrequest keeps the visitor's method; the site's question is always a GET."
  echo "        proxy_method GET;"
  echo "        proxy_pass_request_body off;"
  echo "        proxy_set_header Content-Length \"\";"
  proxy_headers
  echo "        proxy_set_header X-Original-Method \$request_method;"
  echo "        proxy_set_header X-Original-URI \$request_uri;"
  echo "        # A visitor's own headers of these names go nowhere."
  echo "        proxy_set_header X-Bot-Admin-Token \"\";"
  echo "        proxy_set_header X-Acting-User \"\";"
  echo "    }"
  echo "    location /bot-admin/ {"
  echo "        auth_request /_seasonal_bot_admin_auth;"
  echo "        auth_request_set \$seasonal_acting_user \$upstream_http_x_acting_user;"
  echo "        # No path after the address: the bot gets the path as asked, /bot-admin/ included."
  echo "        proxy_pass $BOT_ADMIN_URL;"
  echo "        proxy_http_version 1.1;"
  echo "        proxy_set_header Host \$host;"
  echo "        proxy_set_header X-Forwarded-Proto https;"
  echo "        # The bot takes its token only from this server's own address: no visitor address"
  echo "        # headers that a proxy-aware bot could take as the client instead."
  echo "        proxy_set_header X-Forwarded-For \"\";"
  echo "        proxy_set_header X-Real-IP \"\";"
  echo "        proxy_set_header Forwarded \"\";"
  echo "        # The bot logs in by the token on every request: the visitor's cookies (the site's"
  echo "        # session among them) stay with the site."
  echo "        proxy_set_header Cookie \"\";"
  echo "        # Always replaced: the site's answer (auth_request lets only 2xx through, so it is"
  echo "        # set) and the token from the root-only include; never what the visitor sent."
  echo "        proxy_set_header X-Acting-User \$seasonal_acting_user;"
  echo "        include $BOT_ADMIN_TOKEN_CONF;"
  echo "    }"
}

# --rollback, after the snapshot's nginx files are back: the include and site.env's
# BOT_ADMIN_EMBEDDED follow them. A token named by a file comes from the snapshot's answers.
bot_admin_rollback() {
  local snap="$1" path wanted=no env
  for path in $(nginx_own_files); do
    if grep -qsF "$BOT_ADMIN_TOKEN_CONF" "$path"; then wanted=yes; fi
  done
  env="$(site_env)"
  if [[ "$wanted" == no ]]; then
    rm -f "$BOT_ADMIN_TOKEN_CONF"
    [[ -z "$(kv_get "$env" BOT_ADMIN_EMBEDDED)" ]] || { kv_unset "$env" BOT_ADMIN_EMBEDDED; bot_admin_restart_site; }
    return 0
  fi
  if [[ ! -s "$BOT_ADMIN_TOKEN_CONF" ]]; then
    BOT_ADMIN_TOKEN_FILE="$(kv_get "$snap/install.conf" BOT_ADMIN_TOKEN_FILE)"
    BOT_ADMIN_TOKEN_KEY="$(kv_get "$snap/install.conf" BOT_ADMIN_TOKEN_KEY)"
    [[ -n "$BOT_ADMIN_TOKEN_FILE" ]] ||
      die "the snapshot's nginx files embed the event bot's admin page, whose typed token is gone: run the installer with --bot-admin"
    bot_admin_token_from_file
    bot_admin_token_check
    write_bot_admin_token
    BOT_ADMIN_TOKEN=""
  fi
  [[ "$(kv_get "$env" BOT_ADMIN_EMBEDDED)" == 1 ]] || { kv_set "$env" BOT_ADMIN_EMBEDDED 1; bot_admin_restart_site; }
}

# The site reads BOT_ADMIN_EMBEDDED when it starts: a running site is started again with it.
bot_admin_restart_site() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx seasonal-site-site-1 || return 0
  compose_site up -d site >/dev/null 2>&1 || warn "the site did not restart; run the installer again"
}

# --uninstall, after the nginx files are gone: the token include and the site's switch.
remove_bot_admin() {
  kv_unset "$(site_env)" BOT_ADMIN_EMBEDDED
  [[ -f "$BOT_ADMIN_TOKEN_CONF" ]] || return 0
  rm -f "$BOT_ADMIN_TOKEN_CONF"
  say "the event bot's admin token include removed ($BOT_ADMIN_TOKEN_CONF)"
}

bot_admin_status() {
  if bot_admin_on; then
    say "event bot's admin page: https://$SITE_DOMAIN/bot-admin/ -> $BOT_ADMIN_URL (token $([[ -n "$BOT_ADMIN_TOKEN_FILE" ]] && echo "from $BOT_ADMIN_TOKEN_KEY in $BOT_ADMIN_TOKEN_FILE" || echo typed))"
  else
    say "event bot's admin page: ${BOT_ADMIN_URL:-not asked yet}"
  fi
}
