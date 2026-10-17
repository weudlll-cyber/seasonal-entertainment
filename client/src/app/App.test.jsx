// ============================================================
// File:        App.test.jsx
// Path:        client/src/app/App.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the app shell: header navigation, footer links, the landing page on
//              "/" and the 404 page for unknown paths.
// ============================================================

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { GUEST, mockApi } from '../test/mockApi.js';
import App from './App.jsx';

beforeEach(() => mockApi(GUEST));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('app shell', () => {
  it('shows every main navigation link with its target', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = within(nav)
      .getAllByRole('link')
      .map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Home', '/'],
      ['Info', '/info'],
      ['Games', '/games'],
      ['Events', '/events'],
      ['Chat', '/chat'],
      ['Login', '/login'],
    ]);
  });

  it('shows Imprint and Privacy in the footer', () => {
    renderAt('/');
    const footer = screen.getByRole('navigation', { name: 'Legal' });
    expect(within(footer).getByRole('link', { name: 'Imprint' })).toHaveAttribute(
      'href',
      '/info/imprint'
    );
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/info/privacy'
    );
  });

  it('shows the landing page inside the layout on "/"', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seasonal Entertainment');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('shows the 404 page for an unknown path, still inside the layout', () => {
    renderAt('/no/such/page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
