// ============================================================
// File:        AccountPage.jsx
// Path:        client/src/pages/AccountPage.jsx
// Project:     Seasonal Entertainment
// Description: The signed-in user's own account: details, password change, logout.
// ============================================================

import { useNavigate } from 'react-router';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';
import { useSession } from '../session/SessionContext.jsx';

export default function AccountPage() {
  const { user, logout } = useSession();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <section className="page">
      <h1>Account</h1>
      <dl className="details">
        <dt>Username</dt>
        <dd>{user.username}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Role</dt>
        <dd>{user.role}</dd>
      </dl>
      <h2>Change password</h2>
      <p>Changing your password logs you out everywhere else.</p>
      <ChangePasswordForm />
      <h2>Log out</h2>
      <button className="button" type="button" onClick={onLogout}>
        Log out
      </button>
    </section>
  );
}
