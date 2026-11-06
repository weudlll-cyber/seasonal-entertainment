# shellcheck shell=bash
# ============================================================
# File:        update.sh
# Path:        deploy/install/lib/update.sh
# Project:     Seasonal Entertainment
# Description: --update (docs/DEPLOYMENT.md, "Updating"): checks that the checkout can move,
#              takes a fresh backup when backups are set up, or else a local copy
#              (update_safety_copy, update-copy.sh), moves
#              the checkout forward to origin's default branch (fast-forward only: never a
#              reset, a stash or a discarded change), and hands over to that commit's own
#              installer, which re-runs as a plain re-run does (reexec_installer, also used by
#              --commit, with --coingecko, --discord, --bot-admin, --bingo and --mini-games passed
#              on) except that it takes no second backup (SEASONAL_UPDATE_BACKUP names the one taken here).
#              Anything else it refuses with the reason, before changing anything.
# ============================================================

# reexec_installer: runs the installer of the commit now checked out, in place of this one
# (this file may have changed), with the answers options given now; SEASONAL_REEXEC keeps it
# from moving the checkout again.
reexec_installer() {
  local args=()
  [[ -z "$ANSWERS" ]] || args+=(--answers "$ANSWERS")
  [[ "$UNATTENDED" == no ]] || args+=(--yes)
  [[ "$ASK_COINGECKO" == no ]] || args+=(--coingecko)
  [[ "$ASK_BOT_ADMIN" == no ]] || args+=(--bot-admin)
  [[ "$ASK_DISCORD" == no ]] || args+=(--discord)
  [[ "${ASK_BINGO:-no}" == no ]] || args+=(--bingo)
  [[ "${ASK_MINI_GAMES:-no}" == no ]] || args+=(--mini-games)
  SEASONAL_REEXEC=1 exec "$INSTALL_DIR/deploy/install.sh" "${args[@]}"
}

# The branch origin's HEAD points at (master, main, ...), read without changing any ref.
origin_default_branch() {
  git_here ls-remote --symref origin HEAD 2>/dev/null | sed -n 's|^ref: refs/heads/\([^[:space:]]*\)[[:space:]]*HEAD$|\1|p'
}

# Sets UPDATE_BRANCH, or stops with the reason when the checkout cannot simply move forward to
# origin's default branch. Changes nothing but the remote-tracking refs (git fetch).
update_preflight() {
  local branch
  if ! git_here diff --quiet HEAD -- || ! git_here diff --cached --quiet; then
    die "tracked files in $INSTALL_DIR are modified (git status shows them): commit or undo that change yourself; nothing was changed"
  fi
  UPDATE_BRANCH="$(origin_default_branch)"
  [[ -n "$UPDATE_BRANCH" ]] || die "origin's default branch is unknown (git remote -v in $INSTALL_DIR); nothing was changed"
  git_here fetch -q --tags origin || die "git fetch from origin failed; nothing was changed"
  # HEAD must be part of origin's history: otherwise moving forward would drop commits.
  git_here merge-base --is-ancestor HEAD "origin/$UPDATE_BRANCH" ||
    die "the checkout has commits origin/$UPDATE_BRANCH does not have (diverged, or another branch): update it by hand; nothing was changed"
  branch="$(git_here symbolic-ref -q --short HEAD || true)"
  # On another branch, or detached (after --commit) on a commit of the default branch: the local
  # default branch is used, if it exists it must be able to move forward too.
  if [[ -n "$branch" && "$branch" != "$UPDATE_BRANCH" ]]; then
    die "the checkout is on branch $branch, not $UPDATE_BRANCH: switch with git checkout $UPDATE_BRANCH, or use --commit; nothing was changed"
  fi
  if git_here rev-parse -q --verify "refs/heads/$UPDATE_BRANCH" >/dev/null; then
    git_here merge-base --is-ancestor "refs/heads/$UPDATE_BRANCH" "origin/$UPDATE_BRANCH" ||
      die "the local branch $UPDATE_BRANCH has commits origin/$UPDATE_BRANCH does not have: update it by hand; nothing was changed"
  fi
}

# --update: preflight, backup or copy, fast-forward, then the new commit's installer.
update_installed() {
  local old new
  load_state
  [[ -f "$STATE_FILE" ]] || die "install first: --update moves an installed site to the newest code"
  update_preflight
  old="$(commit_sha)"
  update_safety_copy
  if [[ "$(git_here symbolic-ref -q --short HEAD || true)" != "$UPDATE_BRANCH" ]]; then
    if git_here rev-parse -q --verify "refs/heads/$UPDATE_BRANCH" >/dev/null; then
      git_here checkout -q "$UPDATE_BRANCH" || die "could not switch to $UPDATE_BRANCH"
    else
      git_here checkout -q -b "$UPDATE_BRANCH" --track "origin/$UPDATE_BRANCH" || die "could not switch to $UPDATE_BRANCH"
    fi
  fi
  git_here merge -q --ff-only "origin/$UPDATE_BRANCH" || die "git could not fast-forward to origin/$UPDATE_BRANCH"
  new="$(commit_sha)"
  if [[ "$new" == "$old" ]]; then
    say "code: already the newest on $UPDATE_BRANCH ($(cut -c1-12 <<<"$new")); running the installer again"
  else
    say "code: $(cut -c1-12 <<<"$old") -> $(cut -c1-12 <<<"$new") ($UPDATE_BRANCH)"
  fi
  reexec_installer
}
