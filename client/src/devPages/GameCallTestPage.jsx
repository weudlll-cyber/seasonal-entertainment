// ============================================================
// File:        GameCallTestPage.jsx
// Path:        client/src/devPages/GameCallTestPage.jsx
// Project:     Seasonal Entertainment
// Description: Test-only page (/games/call-test/?call=<id>, routed only by the Vite dev server,
//              never in production builds): a pretend game that frames the call view
//              /embed/call/<id> the way a game under /games/<slug>/ will
//              (docs/GAME-INTEGRATION.md section 9): the slot in the sizes of the contract
//              (desktop 338 x 190, the low strip 267 x 150, collapsed 48 px; the phone's strip
//              and its picture), resized when the view asks (resize), the view's messages in a
//              list, and buttons that send it mute, collapse, theme and visible. ?call=shared
//              ("Frame the shared call") frames /embed/call/shared, whichever call that is.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CALL_HOST_SOURCE, CALL_SOURCE } from '../embed/callView.js';

const SIZES = {
  'Desktop 338 × 190': { width: 338, height: 190 },
  'Low window 267 × 150': { width: 267, height: 150 },
  'Collapsed 48 × 190': { width: 48, height: 190 },
  'Phone strip 390 × 48': { width: 390, height: 48 },
  'Phone picture 390 × 219': { width: 390, height: 219 },
};

export default function GameCallTestPage() {
  const [params, setParams] = useSearchParams();
  const callId = params.get('call') ?? '';
  const frame = useRef(null);
  const [size, setSize] = useState(SIZES['Desktop 338 × 190']);
  const [log, setLog] = useState([]);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [shown, setShown] = useState(true);
  const origin = window.location.origin;

  // The game's side of the check: this origin, this iframe, the view's source.
  useEffect(() => {
    const listener = (event) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.source !== CALL_SOURCE) return;
      if (event.data.type === 'resize') {
        setSize({ width: event.data.width, height: event.data.height });
      }
      setLog((lines) => [...lines, JSON.stringify(event.data)]);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [origin]);

  const send = (type, data) =>
    frame.current?.contentWindow.postMessage({ source: CALL_HOST_SOURCE, type, ...data }, origin);

  return (
    <main style={{ padding: '1rem', display: 'grid', gap: '0.75rem', justifyItems: 'start' }}>
      <h1>Call view test game</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setParams({ call: new FormData(event.currentTarget).get('call') });
        }}
      >
        <label>
          Call id <input name="call" key={callId} defaultValue={callId} />
        </label>{' '}
        <button type="submit" className="button button--secondary">
          Frame it
        </button>{' '}
        <button
          type="button"
          className="button button--secondary"
          onClick={() => setParams({ call: 'shared' })}
        >
          Frame the shared call
        </button>
      </form>
      <p>
        {Object.entries(SIZES).map(([label, next]) => (
          <button
            key={label}
            type="button"
            className="button button--secondary"
            onClick={() => setSize(next)}
          >
            {label}
          </button>
        ))}
      </p>
      <p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            send('mute', { muted: !muted });
            setMuted(!muted);
          }}
        >
          {muted ? 'Send unmute' : 'Send mute'}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            send('collapse', { collapsed: !collapsed });
            setCollapsed(!collapsed);
          }}
        >
          {collapsed ? 'Send expand' : 'Send collapse'}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            send('visible', { visible: !shown });
            setShown(!shown);
          }}
        >
          {shown ? 'Send out of sight' : 'Send in sight'}
        </button>
        {['light', 'dark', 'auto'].map((theme) => (
          <button
            key={theme}
            type="button"
            className="button button--secondary"
            onClick={() => send('theme', { theme })}
          >
            Theme {theme}
          </button>
        ))}
      </p>
      {callId && (
        <iframe
          ref={frame}
          title="Call view"
          src={`/embed/call/${encodeURIComponent(callId)}?theme=auto`}
          allow="autoplay; fullscreen"
          style={{ width: size.width, height: size.height, border: 0 }}
        />
      )}
      <ul aria-label="Messages from the call view">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
