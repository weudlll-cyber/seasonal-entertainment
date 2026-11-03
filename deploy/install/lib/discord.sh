# shellcheck shell=bash
# ============================================================
# File:        discord.sh
# Path:        deploy/install/lib/discord.sh
# Project:     Seasonal Entertainment
# Description: The Discord login's settings (docs/DEPLOYMENT.md, "Discord login"; docs/AUTH.md,
#              "Discord"): the application's client id, the Seasonal Tokens server's id and the
#              client secret, asked once like the CoinGecko key. The secret is typed hidden, or
#              read from a file the owner names (DISCORD_CLIENT_SECRET_FILE, also in the answers
#              file); it is stored only in site.env (mode 600) and never shown or logged. An empty
#              client id is remembered as DISCORD=none in the state (the answer, never a secret):
#              the feature stays off and is not asked again; --discord asks again (there Enter
#              removes the settings). Unattended runs ask nothing; settings already in site.env
#              stay.
# ============================================================

DISCORD_DEFAULT_GUILD=902220302199689266
DISCORD_ID_RE='^[0-9]{17,20}$'

# The secret from the file the owner named: its first line, spaces at the ends dropped. The
# file's name only in a refusal, never its content.
discord_secret_from_file() {
  local file="$1" line
  [[ -f "$file" && -r "$file" ]] || die "cannot read the Discord secret file: $file"
  IFS= read -r line <"$file" || [[ -n "$line" ]] || die "the Discord secret file is empty: $file"
  line="${line%$'\r'}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -n "$line" ]] || die "the Discord secret file is empty: $file"
  printf '%s' "$line"
}

# Checks the answers (never printing the secret): ids are Discord ids, the secret one word of
# printable characters.
discord_check() {
  [[ "$DISCORD_CLIENT_ID" =~ $DISCORD_ID_RE ]] || die "DISCORD_CLIENT_ID is not a Discord id (17-20 digits)"
  [[ "$DISCORD_GUILD_ID" =~ $DISCORD_ID_RE ]] || die "DISCORD_GUILD_ID is not a Discord id (17-20 digits)"
  [[ "$DISCORD_CLIENT_SECRET" =~ ^[[:graph:]]{8,200}$ ]] ||
    die "the Discord client secret must be 8-200 characters without spaces (it is not shown)"
}

# Sets DISCORD_CLIENT_ID, DISCORD_GUILD_ID and DISCORD_CLIENT_SECRET for write_site_env, or
# DISCORD=none, or leaves all unset (keep what site.env has).
ask_discord() {
  [[ "$ASK_DISCORD" == no ]] || DISCORD=""
  # From the answers file: the ids and a secret file.
  if [[ -n "${DISCORD_CLIENT_ID:-}" ]]; then
    : "${DISCORD_GUILD_ID:=$DISCORD_DEFAULT_GUILD}"
    [[ -n "${DISCORD_CLIENT_SECRET_FILE:-}" ]] || die "DISCORD_CLIENT_ID needs DISCORD_CLIENT_SECRET_FILE in the answers file"
    DISCORD_CLIENT_SECRET="$(discord_secret_from_file "$DISCORD_CLIENT_SECRET_FILE")"
    discord_check
    DISCORD=""
    return 0
  fi
  [[ "$ASK_DISCORD" == yes || -z "$(kv_get "$(site_env)" DISCORD_CLIENT_ID)" ]] || return 0
  [[ "${DISCORD:-}" != none && "$UNATTENDED" == no ]] || return 0
  if ! have_tty; then
    [[ "$ASK_DISCORD" == no ]] || die "--discord needs a terminal"
    return 0
  fi
  ask_optional DISCORD_CLIENT_ID "Discord login: the application's client id (empty: no Discord login, not asked again)" "$(discord_explanation)"
  if [[ -z "$DISCORD_CLIENT_ID" ]]; then
    DISCORD=none
    return 0
  fi
  ask DISCORD_GUILD_ID "The Seasonal Tokens Discord server's id" "$DISCORD_DEFAULT_GUILD"
  ask_optional DISCORD_CLIENT_SECRET_FILE "A file holding the client secret (empty: type it, hidden)"
  if [[ -n "$DISCORD_CLIENT_SECRET_FILE" ]]; then
    DISCORD_CLIENT_SECRET="$(discord_secret_from_file "$DISCORD_CLIENT_SECRET_FILE")"
  else
    ask_secret DISCORD_CLIENT_SECRET "The Discord client secret (not shown)"
  fi
  discord_check
  DISCORD=""
}

discord_explanation() {
  cat <<EOF
Discord login (optional): members log in with Discord and show their steps from the Seasonal
Tokens Discord server. You need the Discord application's client id and secret, and its
OAuth2 redirect set to exactly https://$SITE_DOMAIN/api/auth/discord/callback
EOF
}

# For write_site_env (config.sh): the settings into site.env, or out of it after --discord
# answered with Enter; otherwise what site.env has stays.
discord_site_env() {
  local file="$1"
  if [[ -n "${DISCORD_CLIENT_SECRET:-}" ]]; then
    kv_set "$file" DISCORD_CLIENT_ID "$DISCORD_CLIENT_ID"
    kv_set "$file" DISCORD_GUILD_ID "$DISCORD_GUILD_ID"
    kv_set "$file" DISCORD_CLIENT_SECRET "$DISCORD_CLIENT_SECRET"
  elif [[ "${ASK_DISCORD:-no}" == yes && "${DISCORD:-}" == none ]]; then
    kv_unset "$file" DISCORD_CLIENT_ID
    kv_unset "$file" DISCORD_GUILD_ID
    kv_unset "$file" DISCORD_CLIENT_SECRET
  fi
}
