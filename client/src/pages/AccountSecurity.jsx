// ============================================================
// File:        AccountSecurity.jsx
// Path:        client/src/pages/AccountSecurity.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "Sign-in & security" section (AccountPage.jsx): password
//              change (or, for an account made with Discord, setting a first one; #password),
//              two-factor authentication (it needs a password; #two-factor) and Discord (link,
//              steps, unlink: discord/DiscordSection.jsx, while Discord login is set up;
//              #discord). Also what its closed heading says (securityStatus) and whether
//              something here waits for the member (securityNeedsAction), which opens it.
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';
import DiscordSection from '../discord/DiscordSection.jsx';
import FirstPasswordForm from '../discord/FirstPasswordForm.jsx';
import TwoFactorDisable from '../components/TwoFactorDisable.jsx';
import TwoFactorSetup from '../components/TwoFactorSetup.jsx';
import { useSession } from '../session/SessionContext.jsx';

// "Two-factor on · Discord linked": from the session alone; Discord only while it is set up.
export function securityStatus(user, features) {
  const parts = [
    user.hasPassword ? `Two-factor ${user.twoFactorEnabled ? 'on' : 'off'}` : 'No password yet',
  ];
  if (features.discord) parts.push(user.discord ? 'Discord linked' : 'Discord not linked');
  return parts.join(' · ');
}

// Two-factor the site requires but is off, a Discord login's answer to show (?discord=), or a
// Discord link that needs a login again.
export const securityNeedsAction = (user, search) =>
  Boolean(
    (user.twoFactorRequired && !user.twoFactorEnabled) ||
    new URLSearchParams(search).has('discord') ||
    user.discord?.status === 'needs_login'
  );

export default function AccountSecurity() {
  const { user, refresh } = useSession();
  return (
    <>
      {user.hasPassword ? (
        <>
          <h3 id="password">Change password</h3>
          <p>Changing your password logs you out everywhere else.</p>
          <ChangePasswordForm />
        </>
      ) : (
        <>
          <h3 id="password">Set a password</h3>
          <FirstPasswordForm />
        </>
      )}
      <h3 id="two-factor">Two-factor authentication</h3>
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
      <DiscordSection />
    </>
  );
}
