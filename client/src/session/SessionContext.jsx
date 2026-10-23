// ============================================================
// File:        SessionContext.jsx
// Path:        client/src/session/SessionContext.jsx
// Project:     Seasonal Entertainment
// Description: Who is signed in, and the site settings the browser needs (they come with the
//              session; useSiteSettings, with the shared defaults until then). Loads
//              /api/auth/session on start; pages call setUser after login/registration,
//              refresh() after changing the account (e.g. 2FA), and logout() to sign out.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PUBLIC_SETTING_DEFAULTS } from '@seasonal-entertainment/shared/siteSettings.js';
import { api } from '../api/http.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  // undefined = still loading, null = guest, object = signed-in user
  const [user, setUser] = useState(undefined);
  const [settings, setSettings] = useState(PUBLIC_SETTING_DEFAULTS);

  const refresh = useCallback(
    () =>
      api('/auth/session')
        .then((data) => {
          setUser(data.user);
          setSettings({ ...PUBLIC_SETTING_DEFAULTS, ...data.settings });
        })
        .catch(() => setUser(null)),
    []
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, refresh, logout, settings }),
    [user, refresh, logout, settings]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// { key: value } of the public site settings (shared/siteSettings.js).
export const useSiteSettings = () => useSession().settings;

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
