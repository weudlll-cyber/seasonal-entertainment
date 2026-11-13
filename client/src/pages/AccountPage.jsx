// ============================================================
// File:        AccountPage.jsx
// Path:        client/src/pages/AccountPage.jsx
// Project:     Seasonal Entertainment
// Description: The signed-in user's own account (decided 2026-11-13; docs/DESIGN.md "Account
//              page"): a short summary (username, role, email) with "Log out", then six
//              collapsible sections, all closed until opened (components/Disclosure.jsx):
//              Profile (profiles/ProfileSettings.jsx), Sign-in & security (AccountSecurity.jsx),
//              Private messages (unlock, recovery code), Privacy ("Show when I'm online", link
//              previews in direct messages), Notifications (browser notifications and the push
//              switch) and, set apart, Delete my account (DeleteAccountForm). Each closed heading
//              says one short status where the page already knows it. Several may be open; the
//              member's own choice is remembered in this browser (useOpenSections.js). A link to
//              a section or to a part of one (#password, #two-factor, #discord) opens it and
//              scrolls there, and a notice waiting in a section (two-factor required, a Discord
//              answer, a push failure) opens it.
// ============================================================

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import DeleteAccountForm from '../components/DeleteAccountForm.jsx';
import Disclosure from '../components/Disclosure.jsx';
import PrivacySettings from '../components/PrivacySettings.jsx';
import { useOpenSections } from '../components/useOpenSections.js';
import { useKeys } from '../keys/KeyContext.jsx';
import PrivateMessagesSection from '../keys/PrivateMessagesSection.jsx';
import NotificationSettings from '../notify/NotificationSettings.jsx';
import { usePushProgress } from '../notify/pushPending.js';
import ProfileSettings from '../profiles/ProfileSettings.jsx';
import { useSession } from '../session/SessionContext.jsx';
import AccountSecurity, { securityNeedsAction, securityStatus } from './AccountSecurity.jsx';
import './AccountPage.css';

export const OPEN_SECTIONS_KEY = 'se.accountSections';
// Anchors inside a section, and the section that holds them.
const PART_OF = { password: 'sign-in', 'two-factor': 'sign-in', discord: 'sign-in' };

// Loading or a broken key: no line (not known, or the section itself explains it).
const keyStatus = ({ status, hasKey }) =>
  status === 'unlocked'
    ? 'Unlocked on this device'
    : status === 'locked'
      ? hasKey
        ? 'Locked on this device'
        : 'Not set up yet'
      : null;

// The section a link's #anchor names, itself or by holding it.
const anchorOf = (hash) => decodeURIComponent(hash.slice(1));
const sectionOf = (anchor) => PART_OF[anchor] ?? anchor;

export default function AccountPage() {
  const { user, logout, features } = useSession();
  const keys = useKeys();
  const { failure: pushFailure } = usePushProgress(user.id);
  const { hash, search } = useLocation();
  const navigate = useNavigate();
  const securityWaiting = securityNeedsAction(user, search);
  // What a link or a waiting notice opens is open from the first render, never closed first.
  const sections = useOpenSections(
    OPEN_SECTIONS_KEY,
    [
      anchorOf(hash) && sectionOf(anchorOf(hash)),
      securityWaiting && 'sign-in',
      pushFailure && 'notifications',
    ].filter(Boolean)
  );
  const { reveal } = sections;
  // Told by the sections themselves, from what they load anyway (null: not known yet).
  const [hasPicture, setHasPicture] = useState(null);
  const [pushOn, setPushOn] = useState(null);

  // A link to a section, or to a part of one (also one followed while here): open it, then
  // bring the anchor into view.
  useEffect(() => {
    const anchor = anchorOf(hash);
    if (!anchor) return;
    reveal(sectionOf(anchor));
    requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView?.());
  }, [hash, reveal]);

  // A notice that comes up while the page is open (two-factor turned required, a late push
  // failure) opens its section too.
  useEffect(() => {
    if (securityWaiting) reveal('sign-in');
    if (pushFailure) reveal('notifications');
  }, [securityWaiting, pushFailure, reveal]);

  async function onLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  const section = (id, title, status, children, className) => (
    <Disclosure
      id={id}
      title={title}
      status={status}
      open={sections.isOpen(id)}
      onToggle={(open) => sections.toggle(id, open)}
      className={className}
    >
      {children}
    </Disclosure>
  );

  return (
    <section className="page account-page">
      <h1>Account</h1>
      <div className="account-summary card">
        <dl className="details">
          <dt>Username</dt>
          <dd>{user.username}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
          <dt>Email</dt>
          <dd>{user.email ?? 'none (signed up with Discord)'}</dd>
        </dl>
        <button className="button button--secondary" type="button" onClick={onLogout}>
          Log out
        </button>
      </div>
      {section(
        'profile',
        'Profile',
        hasPicture === null ? null : hasPicture ? 'Picture set' : 'No picture',
        <ProfileSettings onStatus={setHasPicture} />
      )}
      {section(
        'sign-in',
        'Sign-in & security',
        securityStatus(user, features),
        <AccountSecurity />
      )}
      {section('private-messages', 'Private messages', keyStatus(keys), <PrivateMessagesSection />)}
      {section(
        'privacy',
        'Privacy',
        [
          user.showOnline === false ? 'Online status hidden' : 'Online status shown',
          user.dmLinkPreviews === false ? 'link previews off' : 'link previews on',
        ].join(' · '),
        <PrivacySettings />
      )}
      {section(
        'notifications',
        'Notifications',
        pushOn === null ? null : `Push on this device: ${pushOn ? 'on' : 'off'}`,
        <NotificationSettings onPushStatus={setPushOn} />
      )}
      {section(
        'delete-account',
        'Delete my account',
        null,
        <DeleteAccountForm />,
        'account-page__delete'
      )}
    </section>
  );
}
