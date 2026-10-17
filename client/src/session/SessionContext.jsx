// ============================================================
// File:        SessionContext.jsx
// Path:        client/src/session/SessionContext.jsx
// Project:     Seasonal Entertainment
// Description: Who is signed in. Loads /api/auth/session once on start; pages call
//              setUser after login/registration and logout() to sign out.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  // undefined = still loading, null = guest, object = signed-in user
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api('/auth/session')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, setUser, logout }), [user, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
