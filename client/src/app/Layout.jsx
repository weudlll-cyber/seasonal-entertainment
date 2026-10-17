// ============================================================
// File:        Layout.jsx
// Path:        client/src/app/Layout.jsx
// Project:     Seasonal Entertainment
// Description: The app shell around every route (docs/DESIGN.md, "Shell"): the sidebar (a
//              top bar below 760px) and the main column with the routed page. The window
//              never scrolls; only the main column does, when its page is taller. Staff
//              accounts without 2FA see a banner leading them to set it up.
// ============================================================

import { Link, Outlet } from 'react-router';
import { useSession } from '../session/SessionContext.jsx';
import Sidebar from './Sidebar.jsx';
import './Layout.css';

export default function Layout() {
  const { user } = useSession();
  return (
    <div className="shell">
      <Sidebar />
      <main className="shell__main">
        {user?.twoFactorRequired && (
          <p className="banner" role="status">
            Your role requires two-factor authentication.{' '}
            <Link to="/account#two-factor">Set it up now</Link>.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}
