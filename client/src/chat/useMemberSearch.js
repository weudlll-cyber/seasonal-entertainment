// ============================================================
// File:        useMemberSearch.js
// Path:        client/src/chat/useMemberSearch.js
// Project:     Seasonal Entertainment
// Description: Members whose name matches what is typed (GET /api/chat/members), debounced, from
//              2 characters; with a room, only members who may read it. Used by "Find a member"
//              in the Direct tab and by the @mention suggestions in the composer.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';

const DEBOUNCE_MS = 250;
export const QUERY_MIN = 2;

// Returns { members: [{ id, username, canReceive, online }], error } for the current query.
export function useMemberSearch(query, room = null) {
  const [found, setFound] = useState({ query: '', members: [], error: null });
  const text = query.trim();

  useEffect(() => {
    if (text.length < QUERY_MIN) return undefined;
    let current = true; // a newer query wins over an older, slower answer
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: text, ...(room && { room }) });
      api(`/chat/members?${params}`)
        .then((data) => current && setFound({ query: text, members: data.members, error: null }))
        .catch((err) => current && setFound({ query: text, members: [], error: err.message }));
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, room]);

  // Answers for an earlier query (or a too-short one) are not shown.
  const fresh = found.query === text && text.length >= QUERY_MIN;
  return { members: fresh ? found.members : [], error: fresh ? found.error : null };
}
