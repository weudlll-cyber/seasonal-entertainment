// ============================================================
// File:        Layout.jsx
// Path:        client/src/app/Layout.jsx
// Project:     Seasonal Entertainment
// Description: Page frame for every route: header, the routed page, footer. Staff accounts
//              without 2FA see a banner leading them to set it up.
// ============================================================

import { Link, Outlet } from 'react-router';
import { useSession } from '../session/SessionContext.jsx';
import SiteFooter from './SiteFooter.jsx';
import SiteHeader from './SiteHeader.jsx';
import './Layout.css';

export default function Layout() {
  const { user } = useSession();
  return (
    <div className="layout">
      <SiteHeader />
      {user?.twoFactorRequired && (
        <p className="banner" role="status">
          Your role requires two-factor authentication.{' '}
          <Link to="/account#two-factor">Set it up now</Link>.
        </p>
      )}
      <main className="layout__main">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
