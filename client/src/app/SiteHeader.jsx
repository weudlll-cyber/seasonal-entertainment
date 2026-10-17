// ============================================================
// File:        SiteHeader.jsx
// Path:        client/src/app/SiteHeader.jsx
// Project:     Seasonal Entertainment
// Description: Site header: logo linking home and the main navigation, with the account
//              link last: "Login" for guests, the username (to /account) when signed in.
// ============================================================

import { Link, NavLink } from 'react-router';
import logo from '../assets/seasonal-entertainment.jpg';
import { useSession } from '../session/SessionContext.jsx';
import { MAIN_NAV } from './navigation.js';

export default function SiteHeader() {
  const { user } = useSession();
  return (
    <header className="site-header">
      <Link to="/" className="site-header__brand">
        <img src={logo} alt="" width="40" height="40" />
        <span>Seasonal Entertainment</span>
      </Link>
      <nav aria-label="Main">
        <ul className="site-header__nav">
          {MAIN_NAV.map((item) => (
            <li key={item.to}>
              {/* `end` keeps Home from being marked active on every page. */}
              <NavLink to={item.to} end={item.to === '/'}>
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            {user ? (
              <NavLink to="/account">{user.username}</NavLink>
            ) : (
              <NavLink to="/login">Login</NavLink>
            )}
          </li>
        </ul>
      </nav>
    </header>
  );
}
