// ============================================================
// File:        useOlderOnTop.js
// Path:        client/src/chat/useOlderOnTop.js
// Project:     Seasonal Entertainment
// Description: Loading older messages at the top of a message list: reaching the top while
//              there are older ones loads the next page, and the reader stays on the message
//              they were looking at (the list grows above it, the view does not jump). Used by
//              the direct conversation; useScrollPin keeps the bottom end.
// ============================================================

import { useLayoutEffect, useRef } from 'react';

// Within this many pixels of the top counts as "at the top".
const NEAR_TOP_PX = 48;

// list: ref to the scrolling element; oldestId: the first message's id; more, loadingOlder,
// loadOlder: from useDirectConversation. Returns { onScroll, showOlder }.
export function useOlderOnTop(list, oldestId, { more, loadingOlder, loadOlder }) {
  // The distance from the bottom before older messages came in; null when none are coming.
  const fromBottom = useRef(null);

  const showOlder = () => {
    const element = list.current;
    if (!more || loadingOlder || !element) return;
    fromBottom.current = element.scrollHeight - element.scrollTop;
    loadOlder();
  };

  // Older messages are in: the same distance from the bottom shows the same message.
  useLayoutEffect(() => {
    const element = list.current;
    if (fromBottom.current === null || !element) return;
    element.scrollTop = element.scrollHeight - fromBottom.current;
    fromBottom.current = null;
  }, [list, oldestId]);

  const onScroll = () => {
    if (list.current.scrollTop <= NEAR_TOP_PX) showOlder();
  };

  return { onScroll, showOlder };
}
