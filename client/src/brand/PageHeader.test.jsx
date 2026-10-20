// ============================================================
// File:        PageHeader.test.jsx
// Path:        client/src/brand/PageHeader.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the section page header (docs/DESIGN.md, "Sub pages"): Games, Events and
//              Chat each show their own quarter of the logo beside the title (with the lead) and
//              the same quarter faint behind the page, hidden from screen readers. Calls:
//              client/src/calls/callsPage.test.jsx.
// ============================================================

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi } from '../test/mockApi.js';

const PAGES = [
  ['/games', 'Games', 'quarter-games'],
  ['/events', 'Events', 'quarter-events'],
  ['/chat', 'Chat', 'quarter-chat'],
];

describe('section page header', () => {
  it.each(PAGES)(
    '%s shows its own quarter beside the title and faint behind',
    async (path, title, file) => {
      mockApi({
        ...GUEST,
        'GET /games': { body: { ok: true, games: [] } },
        'GET /chat/rooms': { body: { ok: true, rooms: [] } },
      });
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      );
      const heading = await screen.findByRole('heading', { level: 1, name: title });
      const header = heading.closest('.page-header');
      expect(header.querySelector('.page-header__mark')).toHaveAttribute(
        'src',
        `/brand/${file}.webp`
      );
      expect(header.querySelector('.page-header__lead').textContent).not.toBe('');
      const wash = document.querySelector('.page-wash');
      expect(wash).toHaveAttribute('src', `/brand/${file}.webp`);
      expect(wash).toHaveAttribute('aria-hidden', 'true');
    }
  );
});
