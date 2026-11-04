# shellcheck shell=bash
# ============================================================
# File:        bingo.sh
# Path:        deploy/install/lib/bingo.sh
# Project:     Seasonal Entertainment
# Description: Seasonal Bingo Royale inside the site (docs/DEPLOYMENT.md, "Seasonal Bingo
#              Royale"; docs/AUTH.md): the question whether it will be embedded (asked once on a
#              terminal, default no, remembered as BINGO in the state; --bingo asks again;
#              BINGO=yes|no in an answers file), with yes the games' sync token made once in the
#              root-only GAMES_SYNC_TOKEN_FILE (never printed) and passed to the site in
#              site.env with GAMES_BINGO_EMBEDDED=1, and the files the bingo game's own installer
#              reads: the folder its route file goes into (ROUTES_DIR, nginx includes every
#              *.conf in it inside the site's server block; this installer never reads, copies,
#              backs up or removes what is in it) and the site's local port (SITE_PORT_FILE).
# ============================================================

ROUTES_DIR="$STATE_DIR/routes"
SITE_PORT_FILE="$STATE_DIR/site-local-port"
GAMES_SYNC_TOKEN_FILE="$STATE_DIR/games-sync-token"

bingo_explanation() {
  cat <<'EOF'
Seasonal Bingo Royale (its own project) can run inside this site at https://<site>/games/bingo,
where players sign in with this site's login. Its own installer then adds its route file; this
installer only prepares the site for it. Not sure? Answer no: it can be added later with --bingo.
EOF
}

# Asked once (BINGO empty), again with --bingo; never in an unattended run, which keeps what
# was remembered (no when nothing was).
ask_bingo() {
  [[ "${ASK_BINGO:-no}" == no ]] || BINGO=""
  if [[ -z "${BINGO:-}" && "$UNATTENDED" == no ]] && have_tty; then
    ask BINGO "Will Seasonal Bingo Royale be embedded at /games/bingo? (yes/no)" no "$(bingo_explanation)"
  fi
  [[ "${ASK_BINGO:-no}" == no || -n "${BINGO:-}" ]] || die "--bingo needs a terminal"
  : "${BINGO:=no}"
  [[ "$BINGO" == yes || "$BINGO" == no ]] || die "BINGO is yes or no"
}

# The sync token, made once (64 hex characters), root only from its first byte; an existing one
# is kept, so the game's copy keeps working across runs.
ensure_games_sync_token() {
  [[ -s "$GAMES_SYNC_TOKEN_FILE" ]] && return 0
  install -d -m 700 "$STATE_DIR"
  local tmp
  tmp="$(umask 077 && mktemp "$GAMES_SYNC_TOKEN_FILE.XXXXXX")"
  new_secret >"$tmp"
  chown root:root "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$GAMES_SYNC_TOKEN_FILE"
  say "the games' sync token: in $GAMES_SYNC_TOKEN_FILE (root only, never shown)"
}

# write_site_env: the switch and the token, or neither.
bingo_site_env() {
  local file="$1"
  if [[ "${BINGO:-no}" == yes ]]; then
    ensure_games_sync_token
    kv_set "$file" GAMES_BINGO_EMBEDDED 1
    kv_set "$file" GAMES_SYNC_TOKEN "$(tr -d '\n' <"$GAMES_SYNC_TOKEN_FILE")"
  else
    kv_unset "$file" GAMES_BINGO_EMBEDDED
    kv_unset "$file" GAMES_SYNC_TOKEN
  fi
}

# setup_nginx, before the site's file: the folder its include names (nginx -t passes with it
# empty) and the port the game reaches the site on.
bingo_before_nginx() {
  install -d -m 755 -o root -g root "$ROUTES_DIR"
  printf '%s\n' "$SITE_LOCAL_PORT" >"$SITE_PORT_FILE"
  chown root:root "$SITE_PORT_FILE"
  chmod 644 "$SITE_PORT_FILE"
}

# Inside the site's server block (nginx_site_conf).
nginx_routes_lines() {
  echo "    # Routes of other projects on this server: Seasonal Bingo Royale's installer writes its"
  echo "    # own file here (docs/DEPLOYMENT.md); this installer never reads or changes them."
  echo "    include $ROUTES_DIR/*.conf;"
  echo "    # The games' account feed is for the game over the local port only (docs/AUTH.md)."
  echo "    location ^~ /api/games/bingo/account-changes {"
  echo "        deny all;"
  echo "    }"
}
