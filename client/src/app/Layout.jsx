// ============================================================
// File:        Layout.jsx
// Path:        client/src/app/Layout.jsx
// Project:     Seasonal Entertainment
// Description: Page frame for every route: header, the routed page, footer.
// ============================================================

import { Outlet } from 'react-router';
import SiteFooter from './SiteFooter.jsx';
import SiteHeader from './SiteHeader.jsx';
import './Layout.css';

export default function Layout() {
  return (
    <div className="layout">
      <SiteHeader />
      <main className="layout__main">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
