// ============================================================
// File:        DiscordConfirmGate.jsx
// Path:        client/src/discord/DiscordConfirmGate.jsx
// Project:     Seasonal Entertainment
// Description: For an account without a password: before a sensitive change (protecting the
//              private-message key, a first password, deleting the account) the server asks for
//              a fresh Discord login, valid 10 minutes (docs/AUTH.md, "Discord: accounts without
//              a password"). While there is none, this shows "Confirm with Discord" (back to this
//              very page) instead of its children; accounts with a password see the children.
// ============================================================

import { useLocation } from 'react-router';
import { useSession } from '../session/SessionContext.jsx';
import DiscordButton from './DiscordButton.jsx';
import { needsDiscordConfirm } from './discordLinks.js';

// what: the change, in words ("protect your private messages").
export default function DiscordConfirmGate({ what, children }) {
  const { user } = useSession();
  const { pathname, search, hash } = useLocation();
  if (!needsDiscordConfirm(user)) return children;
  return (
    <div className="form">
      <p>
        Your account has no password, so Discord confirms it is you: to {what}, log in with Discord
        once more. You come back here.
      </p>
      <DiscordButton intent="confirm" next={`${pathname}${search}${hash}`}>
        Confirm with Discord
      </DiscordButton>
    </div>
  );
}
