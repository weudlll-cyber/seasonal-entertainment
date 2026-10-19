// ============================================================
// File:        EmbedAccount.jsx
// Path:        client/src/embed/EmbedAccount.jsx
// Project:     Seasonal Entertainment
// Description: The account line of the chat embedded on an approved foreign site: "Log in"
//              (the popup on this site, useEmbedLogin.js) for a guest, the member's name and
//              "Log out" once logged in. Also LogInToWrite, the same login in place of a
//              guest's composer there. Same-site embeds have the site's own login instead.
// ============================================================

import { useSession } from '../session/SessionContext.jsx';

// login: useEmbedLogin's { logIn, logOut, error }; ready: the host is verified.
export default function EmbedAccount({ login, ready }) {
  const { user } = useSession();
  return (
    <div className="embed-chat__account">
      {user ? (
        <>
          <span>{user.username}</span>
          <button type="button" className="link-button" onClick={login.logOut}>
            Log out
          </button>
        </>
      ) : (
        <button type="button" className="button" disabled={!ready} onClick={login.logIn}>
          Log in
        </button>
      )}
      {login.error && <span role="alert">{login.error}</span>}
    </div>
  );
}

// In place of the composer for a guest: a guest cannot write on another site (no cookie for
// a guest name), so the room offers the same login as the account line above.
export function LogInToWrite({ login, ready }) {
  return (
    <p className="chat-note">
      <button type="button" className="link-button" disabled={!ready} onClick={login.logIn}>
        Log in to write
      </button>
    </p>
  );
}
