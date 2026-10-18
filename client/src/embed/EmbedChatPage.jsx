// ============================================================
// File:        EmbedChatPage.jsx
// Path:        client/src/embed/EmbedChatPage.jsx
// Project:     Seasonal Entertainment
// Description: /embed/chat?room=<slug>&theme=<light|dark|auto>: only the chat panel (compact),
//              no site shell, for an iframe on a page of this same site (games live under the
//              main domain, decided 2026-10-17; docs/EMBED.md). The site's login state applies
//              as everywhere (same-site frame, same cookie); guests follow the room's rules.
//              Talks to the framing page through embedProtocol.js: ready, unread (messages
//              while the host says the chat is out of sight), resize; it takes visible and
//              theme. The server lets only this origin frame /embed/* (frame-ancestors 'self').
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChatPanel, useNewMessageCount } from '../chat/index.js';
import { useSession } from '../session/SessionContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { onHostMessage, toHost } from './embedProtocol.js';
import './EmbedChat.css';

const THEMES = ['light', 'dark', 'auto'];
const themeOf = (value) => (THEMES.includes(value) ? value : 'auto');

export default function EmbedChatPage() {
  const [params] = useSearchParams();
  const room = params.get('room') || 'general';
  const [theme, setTheme] = useState(() => themeOf(params.get('theme')));
  const [visible, setVisible] = useState(true); // the host says whether its chat is in sight
  const { user } = useSession();
  const { force } = useTheme();
  const root = useRef(null);
  const unread = useNewMessageCount(room, !visible);

  // 'auto' follows the site's own rule (the visitor's choice, else the system setting).
  useEffect(() => {
    force(theme === 'auto' ? null : theme);
    return () => force(null);
  }, [theme, force]);

  useEffect(
    () =>
      onHostMessage((message) => {
        if (message.type === 'visible') setVisible(message.visible !== false);
        if (message.type === 'theme') setTheme(themeOf(message.theme));
      }),
    []
  );

  // Once the account is known (undefined while it loads).
  useEffect(() => {
    if (user !== undefined) toHost('ready', { room, signedIn: Boolean(user) });
  }, [room, user]);

  useEffect(() => toHost('unread', { room, count: unread }), [room, unread]);

  // The content's height, for a host that sizes the iframe to it.
  useEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() =>
      toHost('resize', { height: Math.ceil(element.scrollHeight) })
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <main ref={root} className="embed-chat">
      <ChatPanel room={room} variant="compact" />
    </main>
  );
}
