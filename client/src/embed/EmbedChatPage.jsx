// ============================================================
// File:        EmbedChatPage.jsx
// Path:        client/src/embed/EmbedChatPage.jsx
// Project:     Seasonal Entertainment
// Description: /embed/chat?room=<slug>&theme=<light|dark|auto>: the chat alone, compact, no
//              site shell, for an iframe (docs/EMBED.md). Rooms for everyone; "Direct" for
//              members. On this site's own pages (the games under the main domain) it uses the
//              site's login cookie and device unlock exactly like the site. On an approved
//              foreign site it has no cookie: "Log in" opens a popup on this site, which hands
//              over an embed token and the unlocked key, both kept in memory only
//              (useEmbedLogin.js); there a guest gets "Log in to write" instead of the
//              composer, and members no "Attach file". Talks to the framing page only once its origin is verified
//              (embedProtocol.js): ready, unread (messages while the host says the chat is out
//              of sight), resize; it takes visible and theme.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import ChatTabs from '../app/ChatTabs.jsx';
import DirectTab from '../app/DirectTab.jsx';
import { ChatPanel, onDirectRequest, useNewMessageCount, useUnread } from '../chat/index.js';
import { useSession } from '../session/SessionContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import EmbedAccount, { LogInToWrite } from './EmbedAccount.jsx';
import EmbedDirect from './EmbedDirect.jsx';
import { isForeignEmbed, markForeignEmbed } from './embedAuth.js';
import { onHostMessage, parentOrigin, toHost, verifyHost } from './embedProtocol.js';
import { useEmbedLogin } from './useEmbedLogin.js';
import './EmbedChat.css';

const THEMES = ['light', 'dark', 'auto'];
const themeOf = (value) => (THEMES.includes(value) ? value : 'auto');

// The parent as the browser reports it, decided before anything loads: another site's page
// makes this a foreign embed (no cookie, memory-only key).
function reportedParent() {
  const origin = parentOrigin();
  if (origin && origin !== window.location.origin) markForeignEmbed();
  return origin;
}

export default function EmbedChatPage() {
  const [params] = useSearchParams();
  const room = params.get('room') || 'general';
  const [reported] = useState(reportedParent);
  const [host, setHost] = useState(null); // the verified origin; null: talk to nobody
  const [theme, setTheme] = useState(() => themeOf(params.get('theme')));
  const [visible, setVisible] = useState(true); // the host says whether its chat is in sight
  const [tab, setTab] = useState('rooms');
  const { user } = useSession();
  const { force } = useTheme();
  const unreadCounts = useUnread();
  const login = useEmbedLogin(host);
  const root = useRef(null);
  const unread = useNewMessageCount(room, !visible);
  const foreign = isForeignEmbed();

  useEffect(() => {
    verifyHost(reported).then(setHost, () => setHost(null));
  }, [reported]);

  // "Send private message" in a name menu brings the Direct tab forward, as in the drawer.
  useEffect(() => onDirectRequest(() => setTab('direct')), []);

  // 'auto' follows the site's own rule (the visitor's choice, else the system setting).
  useEffect(() => {
    force(theme === 'auto' ? null : theme);
    return () => force(null);
  }, [theme, force]);

  useEffect(
    () =>
      onHostMessage(host, (message) => {
        if (message.type === 'visible') setVisible(message.visible !== false);
        if (message.type === 'theme') setTheme(themeOf(message.theme));
      }),
    [host]
  );

  // Once the account is known (undefined while it loads).
  useEffect(() => {
    if (user !== undefined) toHost(host, 'ready', { room, signedIn: Boolean(user) });
  }, [host, room, user]);

  useEffect(() => toHost(host, 'unread', { room, count: unread }), [host, room, unread]);

  // The content's height, for a host that sizes the iframe to it.
  useEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() =>
      toHost(host, 'resize', { height: Math.ceil(element.scrollHeight) })
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [host]);

  const shown = user ? tab : 'rooms';
  return (
    <main ref={root} className="embed-chat">
      {foreign && <EmbedAccount login={login} ready={Boolean(host)} />}
      {user && (
        <ChatTabs
          value={shown}
          onChange={setTab}
          idPrefix="embed"
          counts={{ rooms: unreadCounts.roomTotal, direct: unreadCounts.directTotal }}
        />
      )}
      <div id="embed-panel" className="embed-chat__panel">
        {shown === 'rooms' ? (
          // On another site: no uploads with an embed token (the server refuses them), and a
          // guest is offered the login instead of a composer that could not send.
          <ChatPanel
            room={room}
            variant="compact"
            files={!foreign}
            guestPrompt={foreign ? <LogInToWrite login={login} ready={Boolean(host)} /> : null}
          />
        ) : foreign ? (
          <EmbedDirect onUnlock={login.logIn} />
        ) : (
          <DirectTab variant="compact" />
        )}
      </div>
    </main>
  );
}
