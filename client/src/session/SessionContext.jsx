// ============================================================
// File:        SessionContext.jsx
// Path:        client/src/session/SessionContext.jsx
// Project:     Seasonal Entertainment
// Description: Who is signed in, the site settings the browser needs (they come with the
//              session; useSiteSettings, with the shared defaults until then) and which optional
//              features the server is set up for (features.botAdmin: the event bot's admin
//              page; features.discord: the Discord login; both off until the server says
//              otherwise). Loads
//              /api/auth/session on start; pages call setUser after login/registration,
//              refresh() after changing the account (e.g. 2FA), and logout() to sign out
//              (turning this device's web push off first, notify/pushPending.js).
//              When the server answers "not_authenticated" while a member is signed in here
//              (the session ended on the server: idle limit, password change, a sign-out in
//              another tab), the member is dropped once and sessionEnded stays true until the
//              next sign-in (SessionEndedNotice.jsx; docs/AUTH.md, "Sessions"). Coming back to
//              the tab or window asks the server again (returnCheck.js), so a page that loads
//              only public data learns it too.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PUBLIC_SETTING_DEFAULTS } from '@seasonal-entertainment/shared/siteSettings.js';
import { api, onSessionEnded } from '../api/http.js';
import { pushOffForLogout } from '../notify/pushPending.js';
import { useReturnCheck } from './returnCheck.js';

const SessionContext = createContext(null);
// Optional server features: all off until the session answer names them.
const NO_FEATURES = { botAdmin: false, discord: false };

export function SessionProvider({ children }) {
  // undefined = still loading, null = guest, object = signed-in user
  const [user, setUserState] = useState(undefined);
  const [sessionEnded, setSessionEnded] = useState(false);
  // Every new answer about who is signed in replaces an ended session's notice.
  const setUser = useCallback((next) => {
    setSessionEnded(false);
    setUserState(next);
  }, []);
  const [settings, setSettings] = useState(PUBLIC_SETTING_DEFAULTS);
  const [features, setFeatures] = useState(NO_FEATURES);

  const refresh = useCallback(
    () =>
      api('/auth/session')
        .then((data) => {
          setUser(data.user);
          setSettings({ ...PUBLIC_SETTING_DEFAULTS, ...data.settings });
          setFeatures({ ...NO_FEATURES, ...data.features });
        })
        .catch(() => setUser(null)),
    [setUser]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listening only while a member is signed in: once dropped, further refusals change nothing,
  // so a page that keeps asking cannot loop.
  useEffect(() => {
    if (!user) return undefined;
    return onSessionEnded(() => {
      setUserState(null);
      setSessionEnded(true);
    });
  }, [user]);
  useReturnCheck(Boolean(user));

  const logout = useCallback(async () => {
    // This device's web push goes with the sign-in (decided 2026-11-13).
    await pushOffForLogout();
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, [setUser]);

  const value = useMemo(
    () => ({ user, setUser, refresh, logout, settings, features, sessionEnded }),
    [user, setUser, refresh, logout, settings, features, sessionEnded]
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
