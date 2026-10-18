// ============================================================
// File:        Layout.jsx
// Path:        client/src/app/Layout.jsx
// Project:     Seasonal Entertainment
// Description: The app shell around every route (docs/DESIGN.md, "Shell"): the sidebar (a
//              top bar below 760px) and the main column with the routed page. The window
//              never scrolls; only the main column does, when its page is taller. Staff
//              accounts without 2FA see a banner leading them to set it up. Every page except
//              /chat and /admin gets the chat button and drawer (ChatDrawer). Right after a
//              member's key pair was made, the recovery-code offer opens over the page.
// ============================================================

import { Link, Outlet, useLocation } from 'react-router';
import { useKeys } from '../keys/KeyContext.jsx';
import RecoveryOffer from '../keys/RecoveryOffer.jsx';
import { useSession } from '../session/SessionContext.jsx';
import ChatDrawer from './ChatDrawer.jsx';
import Sidebar from './Sidebar.jsx';
import './Layout.css';

export default function Layout() {
  const { user } = useSession();
  const { offerRecovery } = useKeys();
  const { pathname } = useLocation();
  // The full chat page has the chat already; the admin area keeps the screen to itself.
  const chatButton = pathname !== '/chat' && !pathname.startsWith('/admin');
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
      {chatButton && <ChatDrawer />}
      {offerRecovery && <RecoveryOffer />}
    </div>
  );
}
