// ============================================================
// File:        useEmbedLogin.js
// Path:        client/src/embed/useEmbedLogin.js
// Project:     Seasonal Entertainment
// Description: Logging in to the chat embedded on an approved foreign site (docs/EMBED.md):
//              "Log in" opens a small popup on this site (/embed-login, EmbedLoginPage.jsx);
//              its hand-over — the embed token, the account, the unlocked private key — is
//              taken only from that popup window, on this origin, for this host. Everything is
//              kept in memory. When the token ends (refused by the server, its 12 hours over,
//              "Log out" here), the account and the key are forgotten at once.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { api } from '../api/http.js';
import { useKeys } from '../keys/KeyContext.jsx';
import { useSession } from '../session/SessionContext.jsx';
import { dropEmbedToken, onEmbedTokenDropped, setEmbedToken } from './embedAuth.js';
import { LOGIN_SOURCE } from './embedProtocol.js';

// host: the verified origin of the page framing the chat (null until known).
export function useEmbedLogin(host) {
  const { setUser } = useSession();
  const keys = useKeys();
  const keysNow = useRef(keys);
  keysNow.current = keys;
  const popup = useRef(null);
  const expiry = useRef(null);
  const [error, setError] = useState(null);

  // The token ended, whatever the reason: no account and no key stay behind.
  useEffect(
    () =>
      onEmbedTokenDropped(() => {
        clearTimeout(expiry.current);
        keysNow.current.forget();
        setUser(null);
      }),
    [setUser]
  );

  useEffect(() => {
    const listener = (event) => {
      // Only the popup this embed opened, on this site, for the site it is embedded in.
      if (event.source !== popup.current || event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== LOGIN_SOURCE || data.type !== 'login' || data.origin !== host) return;
      setEmbedToken(data.token);
      keysNow.current.adopt(data.user.id, data.key);
      setUser(data.user);
      setError(null);
      clearTimeout(expiry.current);
      expiry.current = setTimeout(dropEmbedToken, Date.parse(data.expiresAt) - Date.now());
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [host, setUser]);

  function logIn() {
    const url = `/embed-login?origin=${encodeURIComponent(host)}`;
    popup.current = window.open(url, 'se-embed-login', 'popup,width=480,height=720');
    if (!popup.current) setError('Allow pop-ups for this page to log in.');
  }

  async function logOut() {
    await api('/embed/logout', { method: 'POST' }).catch(() => {});
    dropEmbedToken();
  }

  return { logIn, logOut, error };
}
