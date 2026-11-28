// ============================================================
// File:        StripTestPage.jsx
// Path:        client/src/devPages/StripTestPage.jsx
// Project:     Seasonal Entertainment
// Description: Test-only page (/games/strip-test/?room=<slug>&call=<id|shared>, routed only by
//              the Vite dev server, never in production builds): a pretend game in a 1278 x 629
//              window with the kit's 100 px docked strip (seasonal-kit v0.41.0): the chat in its
//              card (the frame 90 px high), the call view beside it (267 x 94), both as a game
//              frames them. Buttons give both frames a 16 or 32 px root font and narrow the chat
//              to 267 px.
// ============================================================

import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

const edge = '1px solid var(--color-border)';

export default function StripTestPage() {
  const [params] = useSearchParams();
  const room = params.get('room') ?? 'general';
  const call = params.get('call') ?? 'shared';
  const chat = useRef(null);
  const view = useRef(null);
  const [font, setFont] = useState(16);
  const [narrow, setNarrow] = useState(false);

  // Same origin, so the page can stand in for a visitor's font setting.
  const size = (frame, px) => {
    const root = frame.current?.contentDocument?.documentElement;
    if (root) root.style.fontSize = `${px}px`;
  };

  return (
    <main style={{ padding: 8 }}>
      <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[16, 32].map((px) => (
          <button
            key={px}
            type="button"
            className="button button--secondary"
            aria-pressed={font === px}
            onClick={() => {
              setFont(px);
              size(chat, px);
              size(view, px);
            }}
          >
            {px} px font
          </button>
        ))}
        <button
          type="button"
          className="button button--secondary"
          aria-pressed={narrow}
          onClick={() => setNarrow(!narrow)}
        >
          Chat 267 px wide
        </button>
      </p>
      <div
        style={{
          boxSizing: 'border-box',
          width: 1278,
          height: 629,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          border: edge,
        }}
      >
        <div style={{ flex: 1, display: 'grid', placeContent: 'center' }}>
          The game (a 1278 × 629 window)
        </div>
        <div style={{ display: 'flex', gap: 12, height: 100 }}>
          <div
            style={{
              boxSizing: 'border-box',
              flex: narrow ? '0 0 301px' : 1,
              minWidth: 0,
              padding: '4px 16px',
              border: edge,
              borderRadius: 'var(--radius-card)',
              background: 'var(--color-surface)',
            }}
          >
            <iframe
              ref={chat}
              title="Chat in the strip"
              src={`/embed/chat?room=${encodeURIComponent(room)}&theme=auto`}
              onLoad={() => size(chat, font)}
              style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
            />
          </div>
          <div style={{ boxSizing: 'border-box', width: 267, height: 100, padding: '3px 0' }}>
            <iframe
              ref={view}
              title="Call view in the strip"
              src={`/embed/call/${encodeURIComponent(call)}?theme=auto`}
              allow="autoplay; fullscreen"
              onLoad={() => size(view, font)}
              style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
