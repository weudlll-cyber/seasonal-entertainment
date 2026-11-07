// ============================================================
// File:        callIntent.js
// Path:        client/src/calls/callIntent.js
// Project:     Seasonal Entertainment
// Description: What the Calls page hands to a call's page when it sends an organiser there
//              (docs/CALLS.md, "Starting a call"; decided 2026-11-06): { join: true } after a
//              call was started (join it at once), or { startError } when creating worked but
//              starting did not. Carried in react-router's navigation state and taken once: the
//              page clears it at once, so a reload or a later visit never joins by itself (the
//              browser keeps history state across a reload).
// ============================================================

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

// To /calls/:id with the intent.
export const goToCall = (navigate, id, intent) => navigate(`/calls/${id}`, { state: intent });

// The intent this visit came with ({} for none), the same for the whole visit.
export function useCallIntent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [intent] = useState(() => location.state ?? {});
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
    // Once, on arrival: the state it came with is all there is to clear.
  }, []);
  return intent;
}
