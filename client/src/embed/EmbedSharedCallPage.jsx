// ============================================================
// File:        EmbedSharedCallPage.jsx
// Path:        client/src/embed/EmbedSharedCallPage.jsx
// Project:     Seasonal Entertainment
// Description: /embed/call/shared?theme=<light|dark|auto>: the call view of whichever call is
//              shared with the games now (docs/GAME-INTEGRATION.md section 9, "The shared
//              call", decided 2026-11-24 and 2026-11-25). It reads GET
//              /api/public/shared-call every POLL_MS, for as long as it is open, and shows that
//              call with the per-call view's own parts (EmbedCallPage.jsx: useEmbedFrame,
//              CallInFrame), a new one for each call, so ready names the new call from the same
//              frame. Nothing shared: no ready, and a line saying so. A call that stops being
//              the shared one posts ended: 'ended' or 'gone' as the call itself says, else
//              'unshared'.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/http.js';
import { CallInFrame, POLL_MS, useEmbedFrame } from './EmbedCallPage.jsx';
import { RefusedView } from './EmbedCallView.jsx';
import './EmbedCall.css';

// Why `id` is no longer the shared call, from the call itself; throws without an answer.
async function whyLeft(id) {
  try {
    const { call } = await api(`/calls/${id}`);
    return call.status === 'ended' ? 'ended' : 'unshared';
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return 'gone';
    throw err;
  }
}

export default function EmbedSharedCallPage() {
  const frame = useEmbedFrame();
  const { game, say } = frame;
  // The call in the frame: its id, null while nothing is shared, undefined before the first
  // answer. The ref is what the poll and the messages compare with.
  const [id, setId] = useState(undefined);
  const shown = useRef(undefined);
  // The call whose end the game has heard: once, whoever noticed it first (the call's own
  // view, or this page when the flag goes).
  const endSaid = useRef(null);
  const sayOnce = useCallback(
    (type, data) => {
      if (type === 'ended') {
        if (endSaid.current === shown.current) return;
        endSaid.current = shown.current;
      }
      say(type, data);
    },
    [say]
  );

  useEffect(() => {
    if (!game) return undefined;
    let stopped = false;
    let again;
    async function look() {
      try {
        const answer = await api('/public/shared-call');
        const next = answer.call?.id ?? null;
        const before = shown.current;
        if (next !== before) {
          if (before) {
            const reason = await whyLeft(before);
            if (stopped) return;
            sayOnce('ended', { reason });
          }
          if (stopped) return;
          shown.current = next;
          // The next call's end is news again, also if it is the same call shared anew.
          endSaid.current = null;
          setId(next);
        }
      } catch {
        // No answer changes nothing: the next round asks again.
      }
      if (!stopped) again = setTimeout(look, POLL_MS);
    }
    look();
    return () => {
      stopped = true;
      clearTimeout(again);
    };
  }, [game, sayOnce]);

  if (!game) return <RefusedView href="/calls" />;
  if (!id) {
    return (
      <main className="embed-call embed-call--refused">
        {id === null && <p role="status">No call is shared right now.</p>}
      </main>
    );
  }
  return <CallInFrame key={id} id={String(id)} frame={{ ...frame, say: sayOnce }} />;
}
