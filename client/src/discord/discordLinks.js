// ============================================================
// File:        discordLinks.js
// Path:        client/src/discord/discordLinks.js
// Project:     Seasonal Entertainment
// Description: The browser's side of the Discord login (docs/AUTH.md, "Discord"): the address
//              that starts it (a full-page visit: the server sends the browser on to Discord and
//              back), what each ?discord=<reason> it comes back with means, and whether an
//              account without a password needs to confirm with Discord before a sensitive change
//              (its proof lasts 10 minutes; asked for again a minute before it ends).
// ============================================================

// intent: 'login' (log in or sign up), 'link' (link the signed-in account) or 'confirm' (prove
// it is the account's own Discord user). next: the page to come back to (same-site path).
export function discordStartUrl(intent, next) {
  const query = new URLSearchParams({ intent });
  if (next) query.set('next', next);
  return `/api/auth/discord/start?${query}`;
}

// Leaves the page for Discord and comes back to `next` (the current page by default).
export function goToDiscord(intent, next = window.location.pathname + window.location.search) {
  window.location.assign(discordStartUrl(intent, next));
}

// What the server's ?discord=<reason> means for the person: [kind, text]; kind 'error' or 'ok'.
const REASONS = {
  expired: ['error', 'The Discord login took too long or was interrupted. Please try again.'],
  denied: ['error', 'You did not allow the login on Discord. Nothing was changed.'],
  failed: ['error', 'Discord did not confirm the login. Please try again.'],
  locked: ['error', 'This account is locked.'],
  closed: ['error', 'Registration is closed at the moment, so no new account can be made.'],
  too_many: ['error', 'Too many attempts. Please try again later.'],
  taken: ['error', 'This Discord account is already linked to another account here.'],
  other_user: ['error', 'Your account is linked to a different Discord account.'],
  not_linked: ['error', 'Your account is not linked to Discord.'],
  proof_required: [
    'error',
    'Please enter your password before linking Discord (it may have taken too long).',
  ],
  linked: [
    'ok',
    'Your Discord account is linked. Your steps are read from the Seasonal Tokens server.',
  ],
};

export const discordReason = (reason) => REASONS[reason] ?? null;

const MARGIN_MS = 60_000;

// An account without a password proves itself with a fresh Discord login (the session's
// discordProofUntil); true when it has to do that before the next change.
export const needsDiscordConfirm = (user) =>
  Boolean(user) &&
  !user.hasPassword &&
  !(user.discordProofUntil && Date.parse(user.discordProofUntil) - Date.now() > MARGIN_MS);
