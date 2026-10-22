// ============================================================
// File:        App.test.jsx
// Path:        client/src/app/App.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the app shell: the sidebar's main navigation (with the current page
//              marked), legal links, the account card for guests and members, the Admin item
//              for admins only, the season dots of Games, Events and Chat (their logo quarters'
//              colours), the home page on "/" and the 404 page, both inside the shell.
// ============================================================

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import App from './App.jsx';
import { staffNavFor } from './navigation.js';

const NO_DATA = {
  'GET /games': { body: { ok: true, games: [] } },
};

function renderAt(path, session = GUEST) {
  mockApi({ ...session, ...NO_DATA });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

const linksOf = (container) =>
  within(container)
    .getAllByRole('link')
    .map((a) => [a.textContent, a.getAttribute('href')]);

describe('app shell', () => {
  it('shows every main navigation item with its target, the current one marked', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(linksOf(nav)).toEqual([
      ['Home', '/'],
      ['Games', '/games'],
      ['Events', '/events'],
      ['Chat', '/chat'],
      ['Seasonal Tokens', '/info'],
    ]);
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Games' })).not.toHaveAttribute('aria-current');
  });

  it('on another page that page is current, not Home', () => {
    renderAt('/games');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Games' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it("Games, Events and Chat end in their logo quarter's season dot; Home has none", () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const dotOf = (name) =>
      within(nav).getByRole('link', { name }).querySelector('.nav-item__dot')?.className;
    expect(['Games', 'Events', 'Chat'].map(dotOf)).toEqual(
      ['spring', 'summer', 'autumn'].map((s) => `nav-item__dot nav-item__dot--${s}`)
    );
    expect(dotOf('Home')).toBeUndefined();
  });

  it('shows Imprint, Privacy and "Not financial advice" (the Disclaimer)', () => {
    renderAt('/');
    expect(linksOf(screen.getByRole('navigation', { name: 'Legal' }))).toEqual([
      ['Imprint', '/info/imprint'],
      ['Privacy', '/info/privacy'],
      ['Not financial advice', '/info/disclaimer'],
    ]);
  });

  it('guests get "Log in" and "Register"; members their account card', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
  });

  it('a member sees the account card (name, role) and no Admin item', async () => {
    renderAt('/', signedIn({ id: 2, username: 'mia', role: 'member' }));
    expect(await screen.findByRole('link', { name: 'mia (Member), your account' })).toHaveAttribute(
      'href',
      '/account'
    );
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('an admin also sees the Admin item, below the divider', async () => {
    renderAt('/', signedIn({ id: 1, username: 'ada', role: 'admin' }));
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin'
    );
  });

  it('shows the home page inside the shell', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Welcome to Seasonal Entertainment'
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('shows the 404 page for an unknown path, still inside the shell', () => {
    renderAt('/no/such/page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});

describe('who sees what below the divider', () => {
  it.each([
    [null, []],
    [{ role: 'member' }, []],
    [{ role: 'organiser' }, []],
    [{ role: 'admin' }, ['/admin']],
  ])('%o: %o', (user, targets) => {
    expect(staffNavFor(user).map((item) => item.to)).toEqual(targets);
  });
});
