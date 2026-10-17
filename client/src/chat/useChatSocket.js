// ============================================================
// File:        useChatSocket.js
// Path:        client/src/chat/useChatSocket.js
// Project:     Seasonal Entertainment
// Description: Keeps one WebSocket to /ws/chat open while the chat page is shown, subscribes
//              to the current room and hands pushed events (new / hidden messages) to the page.
//              Reconnects after a few seconds if the connection drops.
// ============================================================

import { useEffect, useRef } from 'react';

const RECONNECT_MS = 3000;

export function useChatSocket(room, onEvent) {
  // The latest handler, so a re-render does not reconnect.
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!room) return undefined;
    let socket;
    let retry;
    let stopped = false;
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';

    const open = () => {
      socket = new WebSocket(`${scheme}://${window.location.host}/ws/chat`);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe', room }));
      socket.onmessage = (event) => handler.current(JSON.parse(event.data));
      socket.onclose = () => {
        if (!stopped) retry = setTimeout(open, RECONNECT_MS);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket.close();
    };
  }, [room]);
}
