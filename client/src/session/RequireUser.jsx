// ============================================================
// File:        RequireUser.jsx
// Path:        client/src/session/RequireUser.jsx
// Project:     Seasonal Entertainment
// Description: Route guard: renders its page for signed-in users, sends guests to /login
//              (and back here afterwards). The server checks again on every request; this
//              only keeps guests from seeing pages that would fail.
// ============================================================

import { Navigate, useLocation } from 'react-router';
import { useSession } from './SessionContext.jsx';

export default function RequireUser({ children }) {
  const { user } = useSession();
  const location = useLocation();
  if (user === undefined) return null; // session still loading
  if (!user) {
    const next = encodeURIComponent(location.pathname);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}
