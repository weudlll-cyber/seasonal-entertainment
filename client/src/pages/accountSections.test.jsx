// ============================================================
// File:        accountSections.test.jsx
// Path:        client/src/pages/accountSections.test.jsx
// Project:     Seasonal Entertainment
// Description: The account page's arrangement (decided 2026-11-13; docs/DESIGN.md "Account
//              page"): the summary with "Log out"; six sections, all closed by default, several
//              open at once, the member's own choice remembered in this browser (and the page
//              still working where storage is blocked); every link to a section or a part of one
//              opens it, also one followed while on the page; a notice waiting in a section
//              (two-factor required, a Discord answer, a push failure) opens it; each closed
//              heading's status line, or none where it is not known.
// ============================================================

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { resetDevice } from '../test/memoryDeviceKey.js';
import { NO_KEY, mockApi, signedIn, withFeatures } from '../test/mockApi.js';
import { OPEN_SECTIONS_KEY } from './AccountPage.jsx';

vi.mock('../keys/deviceKey.js', () => import('../test/memoryDeviceKey.js'));

const anna = { id: 1, username: 'anna', email: 'anna@example.org', role: 'member' };
const NO_PICTURE = { about: '', picture: null };
const SECTIONS = [
  'Profile',
  'Sign-in & security',
  'Private messages',
  'Privacy',
  'Notifications',
  'Delete my account',
];

beforeEach(() => {
  localStorage.clear();
  resetDevice();
});

// The stand-in API for anna's account page; `user` and `answers` change parts of it.
function answersFor({ user = {}, profile = NO_PICTURE, features, answers = {} } = {}) {
  const session = signedIn({ ...anna, ...user });
  return {
    ...(features ? withFeatures(session, features) : session),
    ...NO_KEY,
    'GET /members/anna': { body: { ok: true, profile: { username: 'anna', ...profile } } },
    ...answers,
  };
}

function renderAt(path, options) {
  const calls = mockApi(answersFor(options));
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      {/* A link followed while the account page is open (as the 2FA banner's is). */}
      <Link to="/account#two-factor">to two-factor</Link>
    </MemoryRouter>
  );
  return calls;
}

// A section's heading button (aria-controls: not a form's own button of the same name).
const heading = async (title) =>
  (await screen.findAllByRole('button', { name: new RegExp(`^${title}`) })).find((b) =>
    b.hasAttribute('aria-controls')
  );
const expanded = async (title) => (await heading(title)).getAttribute('aria-expanded');
// Which sections are open, by title, once the page is there.
async function openOnes() {
  const open = [];
  for (const title of SECTIONS) if ((await expanded(title)) === 'true') open.push(title);
  return open;
}
const stored = () => JSON.parse(localStorage.getItem(OPEN_SECTIONS_KEY));

describe('the account page', () => {
  it('a summary with "Log out", and six sections all closed by default', async () => {
    renderAt('/account');
    const summary = (await screen.findByText('anna@example.org')).closest('dl');
    expect(within(summary).getByText('anna')).toBeInTheDocument();
    // As the sidebar shows it (AccountCard's roleName).
    expect(within(summary).getByText('Member')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Log out' })).toBeNull();
    expect(await openOnes()).toEqual([]);
    // Closed means hidden: no section's content is offered.
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
    for (const title of SECTIONS) {
      const button = await heading(title);
      expect(button).toHaveAttribute('aria-controls');
      expect(document.getElementById(button.getAttribute('aria-controls'))).toHaveAttribute(
        'hidden'
      );
    }
    // In the order decided, "Delete my account" last.
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.map((t) => SECTIONS.find((s) => t.startsWith(s)))).toEqual(SECTIONS);
  });

  it('an account made with Discord shows that it has no email', async () => {
    renderAt('/account', { user: { email: null, hasPassword: false } });
    expect(await screen.findByText('none (signed up with Discord)')).toBeInTheDocument();
  });

  it('opens and closes, several at once, and remembers the member’s choice', async () => {
    renderAt('/account');
    fireEvent.click(await heading('Profile'));
    fireEvent.click(await heading('Privacy'));
    expect(await openOnes()).toEqual(['Profile', 'Privacy']);
    expect(screen.getByRole('region', { name: 'Privacy' })).toBeVisible();
    expect(stored().sort()).toEqual(['privacy', 'profile']);

    cleanup(); // the page is left and opened again
    renderAt('/account');
    expect(await openOnes()).toEqual(['Profile', 'Privacy']);
    fireEvent.click(await heading('Profile'));
    expect(await expanded('Profile')).toBe('false');
    expect(stored()).toEqual(['privacy']);

    cleanup();
    renderAt('/account');
    expect(await openOnes()).toEqual(['Privacy']);
  });

  it('works where the browser keeps nothing', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      renderAt('/account');
      fireEvent.click(await heading('Privacy'));
      expect(await screen.findByRole('region', { name: 'Privacy' })).toBeVisible();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it.each([
    ['#profile', 'Profile'],
    ['#sign-in', 'Sign-in & security'],
    ['#password', 'Sign-in & security'],
    ['#two-factor', 'Sign-in & security'],
    ['#discord', 'Sign-in & security'],
    ['#private-messages', 'Private messages'],
    ['#privacy', 'Privacy'],
    ['#notifications', 'Notifications'],
    ['#delete-account', 'Delete my account'],
  ])('the link /account%s opens %s, and only that, without remembering it', async (hash, title) => {
    renderAt(`/account${hash}`, { features: { discord: true } });
    expect(await openOnes()).toEqual([title]);
    // The anchor itself is on the page, inside the open section.
    const anchor = document.getElementById(hash.slice(1));
    expect(anchor).toBeVisible();
    expect(stored()).toBeNull();
  });

  it.each(['#%', '#%E0%A4%A'])(
    'a malformed anchor (%s) is ignored: the page shows, every section closed',
    async (hash) => {
      renderAt(`/account${hash}`);
      expect(await screen.findByText('anna@example.org')).toBeVisible();
      expect(await openOnes()).toEqual([]);
    }
  );

  it('a link followed while on the page opens its section', async () => {
    renderAt('/account');
    expect(await openOnes()).toEqual([]);
    fireEvent.click(screen.getByRole('link', { name: 'to two-factor' }));
    await waitFor(async () => expect(await expanded('Sign-in & security')).toBe('true'));
    expect(screen.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible();
  });

  it('two-factor the role requires opens "Sign-in & security" by itself', async () => {
    renderAt('/account', { user: { role: 'organiser', twoFactorRequired: true } });
    expect(await openOnes()).toEqual(['Sign-in & security']);
    expect(
      await screen.findByText(/Your role requires two-factor authentication\. Organiser/)
    ).toBeVisible();
  });

  it('a Discord answer to show opens "Sign-in & security"', async () => {
    renderAt('/account?discord=linked', { features: { discord: true } });
    expect(await openOnes()).toEqual(['Sign-in & security']);
  });

  it('a push failure kept for the account page opens "Notifications"', async () => {
    localStorage.setItem('se.pushFailed', JSON.stringify({ userId: 1, text: 'It failed.' }));
    renderAt('/account');
    expect(await openOnes()).toEqual(['Notifications']);
  });
});

describe('the closed headings say', () => {
  const status = async (title) =>
    within(await heading(title)).queryByText((_, el) => el.className === 'disclosure__status')
      ?.textContent ?? null;

  it('the picture, two-factor and Discord, the key and the privacy switches', async () => {
    renderAt('/account', {
      profile: { about: '', picture: { url: '/p.webp', thumb: '/t.webp' } },
      user: { twoFactorEnabled: true, discord: { name: 'anna#1', status: 'member', steps: [] } },
      features: { discord: true },
    });
    await waitFor(async () => expect(await status('Profile')).toBe('Picture set'));
    expect(await status('Sign-in & security')).toBe('Two-factor on · Discord linked');
    await waitFor(async () => expect(await status('Private messages')).toBe('Not set up yet'));
    expect(await status('Privacy')).toBe('Online status shown · link previews on');
    expect(await status('Delete my account')).toBeNull();
  });

  it('the other way round, and no Discord part where Discord login is not set up', async () => {
    renderAt('/account', { user: { showOnline: false, dmLinkPreviews: false } });
    await waitFor(async () => expect(await status('Profile')).toBe('No picture'));
    expect(await status('Sign-in & security')).toBe('Two-factor off');
    expect(await status('Privacy')).toBe('Online status hidden · link previews off');
    // Push is not set up in this stand-in: no line rather than a guess.
    expect(await status('Notifications')).toBeNull();
  });

  it('an account without a password yet', async () => {
    renderAt('/account', { user: { email: null, hasPassword: false } });
    expect(await status('Sign-in & security')).toBe('No password yet');
  });
});
