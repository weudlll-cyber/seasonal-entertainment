// ============================================================
// File:        AccountCard.jsx
// Path:        client/src/app/AccountCard.jsx
// Project:     Seasonal Entertainment
// Description: The bottom of the sidebar: the signed-in account (initial, name, role; a link
//              to /account) or, for guests, "Log in" and "Register"; with the theme toggle.
// ============================================================

import { Link } from 'react-router';
import { useSession } from '../session/SessionContext.jsx';
import ThemeToggle from '../theme/ThemeToggle.jsx';

const ROLE_NAMES = { member: 'Member', organiser: 'Organiser', admin: 'Admin' };

export default function AccountCard() {
  const { user } = useSession();
  const role = user && (ROLE_NAMES[user.role] ?? user.role);
  return (
    <div className="account-card">
      {user ? (
        <Link
          to="/account"
          className="account-card__user"
          aria-label={`${user.username} (${role}), your account`}
        >
          <span className="account-card__avatar" aria-hidden="true">
            {user.username[0].toUpperCase()}
          </span>
          <span className="account-card__text">
            <span className="account-card__name">{user.username}</span>
            <span className="account-card__role">{role}</span>
          </span>
        </Link>
      ) : (
        user === null && (
          <div className="account-card__guest">
            <Link to="/login" className="button">
              Log in
            </Link>
            <Link to="/register" className="button button--secondary">
              Register
            </Link>
          </div>
        )
      )}
      <ThemeToggle />
    </div>
  );
}
