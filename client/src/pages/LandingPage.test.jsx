// ============================================================
// File:        LandingPage.test.jsx
// Path:        client/src/pages/LandingPage.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the landing page content: logo, title, sentence and the four season marks.
// ============================================================

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LandingPage from './LandingPage.jsx';

describe('LandingPage', () => {
  it('shows the logo, the title and the sentence', () => {
    render(<LandingPage />);
    expect(screen.getByAltText('Seasonal Entertainment logo').getAttribute('src')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seasonal Entertainment');
    expect(
      screen.getByText('Games, community and everything around Seasonal Tokens.')
    ).toBeInTheDocument();
  });

  it('shows the four season marks in calendar order', () => {
    render(<LandingPage />);
    const seasons = screen.getByRole('list', { name: 'The four seasons' });
    const marks = within(seasons).getAllByRole('img');
    expect(marks.map((img) => img.getAttribute('alt'))).toEqual([
      'Spring season mark',
      'Summer season mark',
      'Autumn season mark',
      'Winter season mark',
    ]);
    marks.forEach((img) => expect(img.getAttribute('src')).toBeTruthy());
  });
});
