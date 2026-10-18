// ============================================================
// File:        useCallsSummary.js
// Path:        client/src/calls/useCallsSummary.js
// Project:     Seasonal Entertainment
// Description: Whether calls are set up and whether one is live (the sidebar's LIVE badge):
//              asked on load, every minute, and at once after this page started, ended or
//              created a call (callsChanged()).
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';

const POLL_MS = 60_000;
const CHANGED = 'se:calls-changed';

// Tell every summary on the page to ask again (after a call was created, started or ended).
export const callsChanged = () => window.dispatchEvent(new Event(CHANGED));

// Returns { configured, live } (both false until the first answer).
export function useCallsSummary() {
  const [summary, setSummary] = useState({ configured: false, live: false });
  useEffect(() => {
    let active = true;
    const load = () =>
      api('/calls/summary')
        .then(({ configured, live }) => active && setSummary({ configured, live }))
        .catch(() => {}); // the badge simply stays as it is
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener(CHANGED, load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(CHANGED, load);
    };
  }, []);
  return summary;
}
