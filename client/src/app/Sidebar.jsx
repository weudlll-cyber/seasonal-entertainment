// ============================================================
// File:        Sidebar.jsx
// Path:        client/src/app/Sidebar.jsx
// Project:     Seasonal Entertainment
// Description: The site's navigation (docs/DESIGN.md, "Shell"). From 760px a 248px sidebar:
//              the emblem and wordmark, main items as pills with icons and their quarter's
//              season dot (Calls with its LIVE badge after Chat), the admin
//              item behind a divider, the account card with the theme toggle, legal links. On
//              a call page (rail) it is an icon rail with tooltips and a LIVE dot, expanded by
//              its menu button or, as an overlay, by pointing or keyboard focus (useRail.js).
//              Below 760px a top bar (brand, theme toggle, menu button) whose menu opens the
//              same navigation as a drawer: closed by its close button, Escape or following a
//              link; focus goes in and back.
// ============================================================

import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { EMBLEM } from '../brand/brand.js';
import { useSession } from '../session/SessionContext.jsx';
import ThemeToggle from '../theme/ThemeToggle.jsx';
import AccountCard from './AccountCard.jsx';
import { useUnread } from '../chat/index.js';
import Icon from './icons.jsx';
import LiveBadge from '../calls/LiveBadge.jsx';
import { useCallsSummary } from '../calls/useCallsSummary.js';
import { CALLS_ITEM, LEGAL_NAV, MAIN_NAV, staffNavFor } from './navigation.js';
import UnreadDots, { unreadSummary } from './UnreadDots.jsx';
import { useRail } from './useRail.js';
import './Sidebar.css';
import './SidebarRail.css';

// label: the link's accessible name when it says more than its text; extra: shown after it.
// The title is the rail's tooltip (the text is hidden there; the name stays the link's).
function NavItem({ item, label, extra = null }) {
  return (
    <li>
      {/* React Router marks "/" only on the home page itself, the others on their section. */}
      <NavLink to={item.to} className="nav-item" aria-label={label} title={item.label}>
        <Icon name={item.icon} />
        <span className="nav-item__label">{item.label}</span>
        {extra}
        {item.dot && <span className={`nav-item__dot nav-item__dot--${item.dot}`} />}
      </NavLink>
    </li>
  );
}

// The "Chat" item with the unread counters: shown as dots, spoken in the link's name.
function ChatNavItem({ item }) {
  const unread = useUnread();
  return (
    <NavItem item={item} label={`${item.label}${unreadSummary(unread)}`} extra={<UnreadDots />} />
  );
}

// "Calls" with a red LIVE badge while a call is live; only when calls are set up (admins
// always: the page tells them it is not configured).
function CallsNavItem({ user }) {
  const { configured, live } = useCallsSummary();
  if (!configured && user?.role !== 'admin') return null;
  return (
    <NavItem
      item={CALLS_ITEM}
      label={live ? `${CALLS_ITEM.label}: a call is live` : undefined}
      extra={live && <LiveBadge />}
    />
  );
}

// rail: the call page's icon rail instead of the full sidebar (from 760px).
export default function Sidebar({ rail = false }) {
  const { user } = useSession();
  const { pathname } = useLocation();
  const railState = useRail(rail);
  // The page the menu was opened on: following a link changes the page and so closes it.
  const [menuPage, setMenuPage] = useState(null);
  const menuOpen = menuPage === pathname;
  const menuButton = useRef(null);
  const closeButton = useRef(null);
  const staffNav = staffNavFor(user);

  function closeMenu() {
    setMenuPage(null);
    menuButton.current?.focus();
  }
  useEffect(() => {
    if (!menuOpen) return undefined;
    closeButton.current?.focus();
    const onKey = (event) => event.key === 'Escape' && closeMenu();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header
      className="sidebar"
      data-open={menuOpen}
      data-rail={rail || undefined}
      data-expanded={railState.expanded || undefined}
      {...railState.events}
    >
      <div className="sidebar__bar">
        {rail && (
          <button
            type="button"
            className="icon-button sidebar__rail-toggle"
            aria-expanded={railState.pinned}
            aria-label={railState.pinned ? 'Collapse menu' : 'Expand menu'}
            title={railState.pinned ? 'Collapse menu' : 'Expand menu'}
            onClick={railState.toggle}
          >
            <Icon name="menu" />
          </button>
        )}
        <Link to="/" className="sidebar__brand" aria-label="Seasonal Entertainment, home">
          <img src={EMBLEM} alt="" width="50" height="40" />
          <span className="sidebar__wordmark" aria-hidden="true">
            <span>SEASONAL</span>
            <span>ENTERTAINMENT</span>
          </span>
        </Link>
        <div className="sidebar__bar-actions">
          <ThemeToggle />
          <button
            ref={menuButton}
            type="button"
            className="icon-button"
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            aria-label="Open menu"
            onClick={() => setMenuPage(pathname)}
          >
            <Icon name="menu" />
          </button>
        </div>
      </div>
      {menuOpen && <div className="sidebar__backdrop" onClick={closeMenu} aria-hidden="true" />}
      <div id="site-navigation" className="sidebar__panel">
        <button
          ref={closeButton}
          type="button"
          className="icon-button sidebar__close"
          aria-label="Close menu"
          onClick={closeMenu}
        >
          <Icon name="close" />
        </button>
        <nav aria-label="Main" className="sidebar__nav">
          <ul>
            {MAIN_NAV.map((item) =>
              item.to === '/chat' ? (
                <Fragment key={item.to}>
                  <ChatNavItem item={item} />
                  <CallsNavItem user={user} />
                </Fragment>
              ) : (
                <NavItem key={item.to} item={item} />
              )
            )}
          </ul>
          {staffNav.length > 0 && (
            <>
              <hr className="sidebar__divider" />
              <ul>
                {staffNav.map((item) => (
                  <NavItem key={item.to} item={item} />
                ))}
              </ul>
            </>
          )}
        </nav>
        <AccountCard />
        <nav aria-label="Legal" className="sidebar__legal">
          {LEGAL_NAV.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
