// ============================================================
// File:        Layout.jsx
// Path:        client/src/app/Layout.jsx
// Project:     Seasonal Entertainment
// Description: The app shell around every route (docs/DESIGN.md, "Shell"): the sidebar (a
//              top bar below 760px) and the main column with the routed page. The window
//              never scrolls; only the main column does, when its page is taller. Staff
//              accounts without 2FA see a banner leading them to set it up. Every page except
//              /chat, a call page, /admin and the login or registration page inside the chat's
//              login popup (?next=/embed-login…) gets the chat button and drawer (ChatDrawer).
//              On a call page the sidebar is an icon rail (more room for the stage). Right
//              after a member's key pair was made, the recovery-code offer opens over the page.
//              Members' call reminders show at the top of the main column (CallNotices); a
//              new device's request for the key asks on an unlocked one (DeviceRequestPrompt).
// ============================================================

import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import CallNotices from '../calls/CallNotices.jsx';
import DeviceRequestPrompt from '../keys/DeviceRequestPrompt.jsx';
import { useKeys } from '../keys/KeyContext.jsx';
import RecoveryOffer from '../keys/RecoveryOffer.jsx';
import { inEmbedLoginFlow } from '../session/nextPage.js';
import { useSession } from '../session/SessionContext.jsx';
import ChatDrawer from './ChatDrawer.jsx';
import { isCallPage } from './navigation.js';
import Sidebar from './Sidebar.jsx';
import './Layout.css';

export default function Layout() {
  const { user } = useSession();
  const { offerRecovery } = useKeys();
  const { pathname, search } = useLocation();
  // The full chat page and a call page (its own chat) have the chat already; the admin area
  // keeps the screen to itself; the login popup is a small window for one step.
  const rail = isCallPage(pathname);
  const chatButton =
    pathname !== '/chat' && !rail && !pathname.startsWith('/admin') && !inEmbedLoginFlow(search);
  return (
    <div className={`shell${rail ? ' shell--rail' : ''}`}>
      <Sidebar rail={rail} />
      <main className="shell__main">
        {user?.twoFactorRequired && (
          <p className="banner" role="status">
            Your role requires two-factor authentication.{' '}
            <Link to="/account#two-factor">Set it up now</Link>.
          </p>
        )}
        {user && <CallNotices />}
        {/* A page loaded on first use (App.jsx) leaves the shell standing while it arrives. */}
        <Suspense>
          <Outlet />
        </Suspense>
      </main>
      {chatButton && <ChatDrawer />}
      {offerRecovery && <RecoveryOffer />}
      {user && <DeviceRequestPrompt />}
    </div>
  );
}
