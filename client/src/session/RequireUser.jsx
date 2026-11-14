// ============================================================
// File:        RequireUser.jsx
// Path:        client/src/session/RequireUser.jsx
// Project:     Seasonal Entertainment
// Description: Route guard: renders its page for signed-in users (with at least `role`, if
//              given), sends guests to /login (and back here afterwards: the same path, ?query
//              and #anchor, nextPage.js), and shows a "not allowed" page to users whose role is
//              too low. The server checks again on every
//              request; this only keeps people from seeing pages that would fail.
// ============================================================

import { Navigate, useLocation } from 'react-router';
import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { herePath, withNext } from './nextPage.js';
import { useSession } from './SessionContext.jsx';

export default function RequireUser({ role, children }) {
  const { user } = useSession();
  const location = useLocation();
  if (user === undefined) return null; // session still loading
  if (!user) {
    // The whole link comes back: its ?query (e.g. a filter) and its #anchor (an account
    // section opens after the login).
    return <Navigate to={withNext('/login', herePath(location))} replace />;
  }
  if (role && !roleAtLeast(user.role, role)) {
    return (
      <section className="page">
        <h1>Not allowed</h1>
        <p>Your account cannot open this page.</p>
      </section>
    );
  }
  return children;
}
