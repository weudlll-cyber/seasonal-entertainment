// ============================================================
// File:        SessionEndedNotice.jsx
// Path:        client/src/session/SessionEndedNotice.jsx
// Project:     Seasonal Entertainment
// Description: "Your sign-in has ended. Please sign in again." at the top of the main column
//              (Layout), once the server refused a request of a member signed in on this page
//              (SessionContext's sessionEnded; docs/AUTH.md, "Sessions"). Its "Sign in" leads
//              to the login page, which returns here afterwards (?next=, the whole link, nextPage.js); a page
//              for members only goes there by itself (RequireUser), and on the login page the
//              notice stands without the link. Gone with the next sign-in.
// ============================================================

import { Link, useLocation } from 'react-router';
import { herePath, withNext } from './nextPage.js';
import { useSession } from './SessionContext.jsx';
import '../app/SiteBanner.css';

export const SESSION_ENDED = 'Your sign-in has ended. Please sign in again.';

export default function SessionEndedNotice() {
  const { sessionEnded } = useSession();
  const location = useLocation();
  if (!sessionEnded) return null;
  return (
    <p className="banner site-banner site-banner--info" role="alert">
      <span>{SESSION_ENDED}</span>
      {location.pathname !== '/login' && (
        <Link className="button button--primary" to={withNext('/login', herePath(location))}>
          Sign in
        </Link>
      )}
    </p>
  );
}
