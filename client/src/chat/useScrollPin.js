// ============================================================
// File:        useScrollPin.js
// Path:        client/src/chat/useScrollPin.js
// Project:     Seasonal Entertainment
// Description: Keeps a message list pinned to the newest message while the reader is at (or
//              near) the bottom; a reader who scrolled up stays where they are and is told about
//              new messages instead. Opening a room starts at the newest message. Content that
//              grows after it arrived (an image loading, a preview card) keeps a pinned reader
//              at the bottom too.
// ============================================================

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Within this many pixels of the end counts as "at the bottom".
const NEAR_BOTTOM_PX = 48;

// list: ref to the scrolling element. Returns { onScroll, unseen, showNewest }.
export function useScrollPin(list, room, messages) {
  const pinned = useRef(true);
  const lastId = useRef(null);
  const [unseen, setUnseen] = useState(false);

  const showNewest = useCallback(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
    pinned.current = true;
    setUnseen(false);
  }, [list]);

  // Another room: start at its newest message again.
  useEffect(() => {
    pinned.current = true;
    lastId.current = null;
    setUnseen(false);
  }, [room]);

  // After every change of the list: follow it when pinned; otherwise a newer message than
  // before means "New messages".
  const newestId = messages.at(-1)?.id ?? null;
  useLayoutEffect(() => {
    const isNewer = newestId !== null && newestId !== lastId.current;
    lastId.current = newestId;
    if (pinned.current) showNewest();
    else if (isNewer) setUnseen(true);
  }, [messages, newestId, showNewest]);

  // The newest message growing later (image loaded, preview card) must not unpin the reader.
  useEffect(() => {
    const newest = list.current?.lastElementChild;
    if (!newest || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (pinned.current) showNewest();
    });
    observer.observe(newest);
    return () => observer.disconnect();
  }, [list, newestId, showNewest]);

  const onScroll = () => {
    const element = list.current;
    pinned.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_PX;
    if (pinned.current) setUnseen(false);
  };

  return { onScroll, unseen, showNewest };
}
