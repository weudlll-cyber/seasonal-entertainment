// ============================================================
// File:        EmbedDemoPage.jsx
// Path:        client/src/devPages/EmbedDemoPage.jsx
// Project:     Seasonal Entertainment
// Description: Test-only page (/test/embed-chat, routed only by the Vite dev server, never in
//              production builds): frames the embedded chat the way a game page will
//              (docs/EMBED.md) and shows its postMessage API at work — the messages it sends
//              (ready, unread, resize) and buttons that send it visible and theme. With
//              ?chatFrom=<origin> it frames the chat from another origin of the same dev
//              server (http://localhost:5380 seen from http://[::1]:5380 is another site), so
//              the foreign-site login popup and private messages can be tried on one machine
//              once an admin has approved this page's origin under Admin → Embedding.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EMBED_SOURCE, HOST_SOURCE } from '../embed/embedProtocol.js';

// The other name of this dev server: localhost <-> [::1].
function otherOrigin() {
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname === 'localhost' ? '[::1]' : 'localhost'}:${port}`;
}

export default function EmbedDemoPage() {
  const [params] = useSearchParams();
  const chatFrom = params.get('chatFrom') ?? window.location.origin; // where the chat lives
  const foreign = chatFrom !== window.location.origin;
  const frame = useRef(null);
  const [log, setLog] = useState([]);
  const [shown, setShown] = useState(true);
  const [unread, setUnread] = useState(0);

  // The host's side of the check: only the chat's origin, only this iframe.
  useEffect(() => {
    const listener = (event) => {
      if (event.origin !== chatFrom) return;
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.source !== EMBED_SOURCE) return;
      if (event.data.type === 'unread') setUnread(event.data.count);
      setLog((lines) => [...lines.slice(-19), JSON.stringify(event.data)]);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [chatFrom]);

  const send = (message) =>
    frame.current?.contentWindow.postMessage({ source: HOST_SOURCE, ...message }, chatFrom);

  function toggle() {
    send({ type: 'visible', visible: !shown });
    setShown(!shown);
  }

  return (
    <section className="page page--wide">
      <h1>Embedded chat (test page)</h1>
      <p>
        {foreign ? (
          <>
            The chat comes from <code>{chatFrom}</code>, another site than this page (
            <code>{window.location.origin}</code>), which must be approved under Admin → Embedding.
            Logging in opens a popup there.
          </>
        ) : (
          <>
            The chat comes from this same site.{' '}
            <a
              href={`${otherOrigin()}/test/embed-chat?chatFrom=${encodeURIComponent(window.location.origin)}`}
            >
              Try it as another site
            </a>
          </>
        )}
      </p>
      <p>
        <button type="button" className="button" onClick={toggle}>
          {shown ? 'Hide chat' : `Show chat (${unread} new)`}
        </button>{' '}
        {['light', 'dark', 'auto'].map((theme) => (
          <button
            key={theme}
            type="button"
            className="button button--secondary"
            onClick={() => send({ type: 'theme', theme })}
          >
            Theme: {theme}
          </button>
        ))}
      </p>
      <iframe
        ref={frame}
        title="Chat"
        src={`${chatFrom}/embed/chat?room=general&theme=auto`}
        hidden={!shown}
        style={{ width: '100%', maxWidth: '28rem', height: '36rem', border: 0 }}
      />
      <h2>Messages from the chat</h2>
      <ol aria-label="Messages from the chat">
        {log.map((line, i) => (
          <li key={i}>
            <code>{line}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
