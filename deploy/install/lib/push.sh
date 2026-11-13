# shellcheck shell=bash
# ============================================================
# File:        push.sh
# Path:        deploy/install/lib/push.sh
# Project:     Seasonal Entertainment
# Description: The site's web push key pair (VAPID; docs/CALLS.md, "Push when a call starts",
#              docs/DEPLOYMENT.md, "Web push"): made once with openssl (a P-256 key) into
#              site.env as VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (base64url), never printed;
#              kept on every later run and --update, since the members' subscriptions are bound
#              to the public key. A half pair (one key lost) is made again whole.
# ============================================================

# base64url without padding, of the bytes on stdin.
b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }

# write_site_env (config.sh): the pair, only when site.env lacks either key.
push_site_env() {
  local file="$1" der
  [[ -n "$(kv_get "$file" VAPID_PUBLIC_KEY)" && -n "$(kv_get "$file" VAPID_PRIVATE_KEY)" ]] &&
    return 0
  # The key in a root-only temporary file, gone at once; kv_set writes with the shell's own
  # printf, so neither key is ever on a process's command line.
  der="$(umask 077 && mktemp)"
  openssl ecparam -name prime256v1 -genkey -noout -outform DER >"$der" 2>/dev/null
  # SEC1 DER of a P-256 key is 121 bytes: the private key at byte 8 (32 bytes), the public key
  # (an uncompressed point, 65 bytes) at the end.
  if [[ "$(wc -c <"$der")" -ne 121 ]]; then
    rm -f "$der"
    die "could not make the web push keys (openssl)"
  fi
  kv_set "$file" VAPID_PRIVATE_KEY "$(tail -c +8 "$der" | head -c 32 | b64url)"
  kv_set "$file" VAPID_PUBLIC_KEY "$(tail -c 65 "$der" | b64url)"
  rm -f "$der"
  say "web push keys: made in $SITE_DIR_REL/site.env (never shown)"
}
