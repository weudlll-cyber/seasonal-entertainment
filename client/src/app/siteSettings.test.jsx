// ============================================================
// File:        siteSettings.test.jsx
// Path:        client/src/app/siteSettings.test.jsx
// Project:     Seasonal Entertainment
// Description: The "Site banner" and "Home" site settings in the browser: the banner shows on
//              every page while it is on, as plain text, with its link and style; dismissed,
//              it stays away until its text changes. The season clock and "Start here" (the
//              sidebar item and home's link) go when switched off.
// ============================================================

import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GUEST, mockApi, withSettings } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const DATA = { 'GET /games': { body: { ok: true, games: [] } } };
const BANNER = {
  'banner.enabled': true,
  'banner.text': 'Maintenance tonight from 22:00 <b>not bold</b>',
  'banner.link': '/start',
  'banner.style': 'info',
};

beforeEach(() => localStorage.clear());

async function at(path, settings) {
  mockApi({ ...withSettings(GUEST, settings), ...DATA });
  return renderApp(path);
}

describe('site banner', () => {
  it('shows its text as plain text, with its link, on any page', async () => {
    await at('/games', BANNER);
    const banner = await screen.findByRole('status', { name: '' });
    expect(banner).toHaveTextContent('Maintenance tonight from 22:00 <b>not bold</b>');
    expect(banner.querySelector('b')).toBeNull(); // no HTML
    expect(screen.getByRole('link', { name: 'Read more' })).toHaveAttribute('href', '/start');
    expect(banner).toHaveClass('site-banner--info');
  });

  it('a warning is announced at once, in its own style', async () => {
    await at('/games', { ...BANNER, 'banner.style': 'warning', 'banner.link': '' });
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveClass('site-banner--warning');
    expect(screen.queryByRole('link', { name: 'Read more' })).toBeNull();
  });

  it('off, or without text: nothing', async () => {
    await at('/games', { ...BANNER, 'banner.enabled': false });
    await screen.findByRole('link', { name: /^Chat/ });
    expect(screen.queryByText(/Maintenance tonight/)).toBeNull();
  });

  it('dismissed it stays away; a changed text shows again', async () => {
    const first = await at('/games', BANNER);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Maintenance tonight/)).toBeNull();
    first.unmount();

    const again = await at('/games', BANNER); // a reload
    await screen.findByRole('link', { name: /^Chat/ });
    expect(screen.queryByText(/Maintenance tonight/)).toBeNull();
    again.unmount();

    await at('/games', { ...BANNER, 'banner.text': 'Maintenance moved to Friday' });
    expect(await screen.findByText('Maintenance moved to Friday')).toBeInTheDocument();
  });
});

describe('home', () => {
  it('the season clock and "Start here" show by default', async () => {
    await at('/', {});
    expect(await screen.findByRole('region', { name: 'Season clock' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start here' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'New here? Start here' })).toBeVisible();
  });

  it('switched off, they go', async () => {
    await at('/', { 'home.seasonClock': false, 'home.startHere': false });
    await screen.findByRole('link', { name: /^Chat/ });
    expect(screen.queryByRole('region', { name: 'Season clock' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Start here' })).toBeNull();
    // Home's link keeps its place but is hidden, so nothing moves.
    expect(screen.queryByRole('link', { name: 'New here? Start here' })).toBeNull();
  });
});
