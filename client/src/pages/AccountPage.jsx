// ============================================================
// File:        AccountPage.jsx
// Path:        client/src/pages/AccountPage.jsx
// Project:     Seasonal Entertainment
// Description: The signed-in user's own account: details, Discord (link, steps, unlink:
//              discord/DiscordSection.jsx, while Discord login is set up), password change (or,
//              for an account made with Discord, setting a first one), two-factor
//              authentication (it needs a password), private messages (unlock, recovery code),
//              privacy ("Show when I'm online", link previews in direct messages), browser
//              notifications, logout, and deleting the account (DeleteAccountForm).
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { useNavigate } from 'react-router';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';
import DeleteAccountForm from '../components/DeleteAccountForm.jsx';
import DiscordSection from '../discord/DiscordSection.jsx';
import FirstPasswordForm from '../discord/FirstPasswordForm.jsx';
import PrivacySettings from '../components/PrivacySettings.jsx';
import NotificationSettings from '../notify/NotificationSettings.jsx';
import TwoFactorDisable from '../components/TwoFactorDisable.jsx';
import TwoFactorSetup from '../components/TwoFactorSetup.jsx';
import PrivateMessagesSection from '../keys/PrivateMessagesSection.jsx';
import { useSession } from '../session/SessionContext.jsx';

export default function AccountPage() {
  const { user, refresh, logout } = useSession();
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
        <dd>{user.email ?? 'none (signed up with Discord)'}</dd>
        <dt>Role</dt>
        <dd>{user.role}</dd>
      </dl>
      <DiscordSection />
      {user.hasPassword ? (
        <>
          <h2>Change password</h2>
          <p>Changing your password logs you out everywhere else.</p>
          <ChangePasswordForm />
        </>
      ) : (
        <>
          <h2 id="password">Set a password</h2>
          <FirstPasswordForm />
        </>
      )}
      <h2 id="two-factor">Two-factor authentication</h2>
      {!user.hasPassword ? (
        <p>Two-factor authentication works with a password: set one first (above).</p>
      ) : user.twoFactorEnabled ? (
        <>
          <p>Two-factor authentication is on.</p>
          <TwoFactorDisable onDisabled={refresh} />
        </>
      ) : (
        <>
          <p>
            {!user.twoFactorRequired
              ? 'Optional for members: a code from an authenticator app in addition to your password.'
              : roleAtLeast(user.role, 'organiser')
                ? 'Your role requires two-factor authentication. Organiser and admin actions stay blocked until it is on.'
                : 'This site requires two-factor authentication for every member. Member features stay blocked until it is on.'}
          </p>
          <TwoFactorSetup onEnabled={refresh} />
        </>
      )}
      <PrivateMessagesSection />
      <PrivacySettings />
      <NotificationSettings />
      <h2>Log out</h2>
      <button className="button" type="button" onClick={onLogout}>
        Log out
      </button>
      <h2 id="delete-account">Delete my account</h2>
      <DeleteAccountForm />
    </section>
  );
}
