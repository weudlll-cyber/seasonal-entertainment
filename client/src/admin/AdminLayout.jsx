// ============================================================
// File:        AdminLayout.jsx
// Path:        client/src/admin/AdminLayout.jsx
// Project:     Seasonal Entertainment
// Description: Frame of the admin area: heading, section navigation (a section of an optional
//              feature only while the server has it, e.g. Discord steps), the routed section
//              (each loaded on first use, App.jsx: the frame stays while it arrives, and a
//              section that cannot be loaded shows its error inside the frame, LazyBoundary).
// ============================================================

import { NavLink, Outlet, useLocation } from 'react-router';
import LazyBoundary from '../app/LazyBoundary.jsx';
import { ADMIN_NAV } from '../app/navigation.js';
import { useSession } from '../session/SessionContext.jsx';
import './admin.css';

export default function AdminLayout() {
  const { pathname } = useLocation();
  const { features } = useSession();
  const sections = ADMIN_NAV.filter((item) => !item.feature || features[item.feature]);
  return (
    <section className="page page--wide">
      <h1>Admin</h1>
      <nav aria-label="Admin">
        <ul className="admin-nav">
          {sections.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to}>{item.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <LazyBoundary resetKey={pathname}>
        <Outlet />
      </LazyBoundary>
    </section>
  );
}
