# shellcheck shell=bash
# ============================================================
# File:        games.sh
# Path:        deploy/install/lib/games.sh
# Project:     Seasonal Entertainment
# Description: The embedded games inside the site (docs/DEPLOYMENT.md, "Embedded games";
#              docs/AUTH.md): Seasonal Bingo Royale at /games/bingo and Seasonal Mini Games at
#              /games/mini-games, each its own project with its own installer (decided
#              2026-11-04). One question per game, whether it will be embedded (asked once on a
#              terminal, default no, remembered as BINGO / MINI_GAMES in the state; --bingo and
#              --mini-games ask again; BINGO=yes|no and MINI_GAMES=yes|no in an answers file;
#              an unattended run keeps what was remembered, no when nothing was). With any game
#              on, the games' sync token made once in the root-only GAMES_SYNC_TOKEN_FILE (never
#              printed) and passed to the site in site.env with the list GAMES_EMBEDDED. Always
#              (nginx mode) the files the games' own installers read: the folder their route
#              files go into (ROUTES_DIR, nginx includes every *.conf in it inside the site's
#              server block; this installer never reads, copies, backs up or removes what is in
#              it) and the site's local port (SITE_PORT_FILE); every game's account feed denied.
# ============================================================

ROUTES_DIR="$STATE_DIR/routes"
SITE_PORT_FILE="$STATE_DIR/site-local-port"
GAMES_SYNC_TOKEN_FILE="$STATE_DIR/games-sync-token"

# Each game: its slug, the key of its answer (state, answers file; ASK_<key> is set by --<slug>)
# and its name. The same slugs as the site's list (server/src/games/embedded.js); the own-Caddy
# site denies the same feeds (deploy/site/Caddyfile).
EMBEDDED_GAMES=(
  "bingo BINGO Seasonal Bingo Royale"
  "mini-games MINI_GAMES Seasonal Mini Games"
)

game_explanation() {
  local slug="$1" name="$2"
  cat <<EOF
$name (its own project) can run inside this site at https://<site>/games/$slug, where players
sign in with this site's login. Its own installer then adds its route file; this installer only
prepares the site for it. Not sure? Answer no: it can be added later with --$slug.
EOF
}

# Each asked once (its answer empty), again with its flag; never in an unattended run, which
# keeps what was remembered (no when nothing was).
ask_games() {
  local entry slug key name flag
  for entry in "${EMBEDDED_GAMES[@]}"; do
    read -r slug key name <<<"$entry"
    flag="ASK_$key"
    [[ "${!flag:-no}" == no ]] || printf -v "$key" '%s' ''
    if [[ -z "${!key:-}" && "$UNATTENDED" == no ]] && have_tty; then
      ask "$key" "Will $name be embedded at /games/$slug? (yes/no)" no "$(game_explanation "$slug" "$name")"
    fi
    [[ "${!flag:-no}" == no || -n "${!key:-}" ]] || die "--$slug needs a terminal"
    [[ -n "${!key:-}" ]] || printf -v "$key" '%s' no
    [[ "${!key}" == yes || "${!key}" == no ]] || die "$key is yes or no"
  done
}

# The slugs of the games answered yes, comma-separated (empty: none).
games_on() {
  local entry slug key name on=()
  for entry in "${EMBEDDED_GAMES[@]}"; do
    read -r slug key name <<<"$entry"
    if [[ "${!key:-no}" == yes ]]; then on+=("$slug"); fi
  done
  (IFS=,; printf '%s' "${on[*]}")
}

# The sync token, made once (64 hex characters), root only from its first byte; an existing one
# is kept, so the games' copies keep working across runs. One token for all games.
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

# write_site_env: the list and the token, or neither. GAMES_BINGO_EMBEDDED, the switch the
# Bingo-only step wrote, goes: the list carries bingo now (the site reads both, config.js).
games_site_env() {
  local file="$1" on
  on="$(games_on)"
  kv_unset "$file" GAMES_BINGO_EMBEDDED
  if [[ -n "$on" ]]; then
    ensure_games_sync_token
    kv_set "$file" GAMES_EMBEDDED "$on"
    kv_set "$file" GAMES_SYNC_TOKEN "$(tr -d '\n' <"$GAMES_SYNC_TOKEN_FILE")"
  else
    kv_unset "$file" GAMES_EMBEDDED
    kv_unset "$file" GAMES_SYNC_TOKEN
  fi
}

# setup_nginx, before the site's file: the folder its include names (nginx -t passes with it
# empty) and the port the games reach the site on.
games_before_nginx() {
  install -d -m 755 -o root -g root "$ROUTES_DIR"
  printf '%s\n' "$SITE_LOCAL_PORT" >"$SITE_PORT_FILE"
  chown root:root "$SITE_PORT_FILE"
  chmod 644 "$SITE_PORT_FILE"
}

# Inside the site's server block (nginx_site_conf). Every game's feed is denied, switched on or
# not: a game switched on later needs no new site file.
nginx_routes_lines() {
  local entry slug key name
  echo "    # Routes of other projects on this server: each embedded game's installer writes its"
  echo "    # own file here (docs/DEPLOYMENT.md); this installer never reads or changes them."
  echo "    include $ROUTES_DIR/*.conf;"
  echo "    # The games' account feeds are for the games over the local port only (docs/AUTH.md)."
  for entry in "${EMBEDDED_GAMES[@]}"; do
    read -r slug key name <<<"$entry"
    echo "    location ^~ /api/games/$slug/account-changes {"
    echo "        deny all;"
    echo "    }"
  done
}
