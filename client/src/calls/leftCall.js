// ============================================================
// File:        leftCall.js
// Path:        client/src/calls/leftCall.js
// Project:     Seasonal Entertainment
// Description: "I left this call", between the pages of one browser (decided 2026-11-24;
//              docs/CALLS.md, "Joining"): the call page announces it on a BroadcastChannel
//              (useCallRoom.js), and the shared call view of a member who is in the call
//              already (embed/EmbedCallPage.jsx) asks to join again at once. useAskAgain is
//              that asking: every few seconds, which also covers another device, and on the
//              announcement.
// ============================================================

import { useEffect, useRef } from 'react';

const CHANNEL = 'seasonal-call-left';
// The call server needs a moment to drop a connection (0.1 to 0.2 s, measured 2026-11-24): a
// question asked on the announcement may come too early, so it is asked once more.
export const ASK_ONCE_MORE_MS = 500;

export function announceLeft(callId) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ call: Number(callId) });
  channel.close();
}

// While `waiting`: calls ask() every `every` ms, and when this browser says the member left call
// `callId`. One question at a time.
export function useAskAgain(callId, waiting, ask, every) {
  const latest = useRef(ask);
  useEffect(() => {
    latest.current = ask;
  });
  useEffect(() => {
    if (!waiting) return undefined;
    let asking = false;
    let soon;
    const now = async () => {
      if (asking) return;
      asking = true;
      await latest.current();
      asking = false;
    };
    const timer = setInterval(now, every);
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = ({ data }) => {
      if (data?.call !== Number(callId)) return;
      now();
      clearTimeout(soon);
      soon = setTimeout(now, ASK_ONCE_MORE_MS);
    };
    return () => {
      clearInterval(timer);
      clearTimeout(soon);
      channel.close();
    };
  }, [callId, waiting, every]);
}
