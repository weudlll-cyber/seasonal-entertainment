// ============================================================
// File:        AdminLayout.jsx
// Path:        client/src/admin/AdminLayout.jsx
// Project:     Seasonal Entertainment
// Description: Frame of the admin area: heading, section navigation, the routed section.
// ============================================================

import { NavLink, Outlet } from 'react-router';
import { ADMIN_NAV } from '../app/navigation.js';
import './admin.css';

export default function AdminLayout() {
  return (
    <section className="page page--wide">
      <h1>Admin</h1>
      <nav aria-label="Admin">
        <ul className="admin-nav">
          {ADMIN_NAV.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to}>{item.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </section>
  );
}
