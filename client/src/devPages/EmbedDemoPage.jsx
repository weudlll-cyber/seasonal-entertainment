// ============================================================
// File:        EmbedDemoPage.jsx
// Path:        client/src/devPages/EmbedDemoPage.jsx
// Project:     Seasonal Entertainment
// Description: Test-only page (/test/embed-chat, routed only by the Vite dev server, never in
//              production builds): frames the embedded chat the way a game page of this site
//              will (docs/EMBED.md) and shows its postMessage API at work — the messages it
//              sends (ready, unread, resize) and buttons that send it visible and theme.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { EMBED_SOURCE, HOST_SOURCE } from '../embed/embedProtocol.js';

export default function EmbedDemoPage() {
  const frame = useRef(null);
  const [log, setLog] = useState([]);
  const [shown, setShown] = useState(true);
  const [unread, setUnread] = useState(0);

  // The host's side of the check: only this origin, only this iframe.
  useEffect(() => {
    const listener = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.source !== EMBED_SOURCE) return;
      if (event.data.type === 'unread') setUnread(event.data.count);
      setLog((lines) => [...lines.slice(-19), JSON.stringify(event.data)]);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  const send = (message) =>
    frame.current?.contentWindow.postMessage(
      { source: HOST_SOURCE, ...message },
      window.location.origin
    );

  function toggle() {
    send({ type: 'visible', visible: !shown });
    setShown(!shown);
  }

  return (
    <section className="page page--wide">
      <h1>Embedded chat (test page)</h1>
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
        src="/embed/chat?room=general&theme=auto"
        hidden={!shown}
        style={{ width: '100%', maxWidth: '28rem', height: '32rem', border: 0 }}
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
