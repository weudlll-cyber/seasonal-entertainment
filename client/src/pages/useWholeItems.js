// ============================================================
// File:        useWholeItems.js
// Path:        client/src/pages/useWholeItems.js
// Project:     Seasonal Entertainment
// Description: How many items of a list fit wholly into the list's own height, kept up to date
//              as the list is resized (a ResizeObserver). For a box of fixed height that must
//              never show an item cut in half: home's "Up next" (homeCards.jsx) hides the items
//              from this count on (docs/DESIGN.md, "Home").
// ============================================================

import { useLayoutEffect, useState } from 'react';

// The number of leading items whose bottom is inside the list's bottom; all when none overflow.
export function wholeItemCount(listBottom, itemBottoms) {
  const first = itemBottoms.findIndex((bottom) => bottom > listBottom + 0.5);
  return first === -1 ? itemBottoms.length : first;
}

// listRef: the list element; itemCount: how many items it renders (measured again when it
// changes). Without layout (no ResizeObserver: tests) every item counts as whole.
export function useWholeItems(listRef, itemCount) {
  const [whole, setWhole] = useState(itemCount);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') {
      setWhole(itemCount);
      return undefined;
    }
    const measure = () =>
      setWhole(
        wholeItemCount(
          list.getBoundingClientRect().bottom,
          [...list.children].map((item) => item.getBoundingClientRect().bottom)
        )
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [listRef, itemCount]);
  return whole;
}
