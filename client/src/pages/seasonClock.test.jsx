// ============================================================
// File:        seasonClock.test.jsx
// Path:        client/src/pages/seasonClock.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the home banner's season clock: the token in season with its icon, the
//              next halving by the day only (no time) in the site's date format, and the line
//              naming the source.
// ============================================================

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SeasonClock from './SeasonClock.jsx';

describe('season clock', () => {
  it('names the season and the next halving by the day, from the contracts', () => {
    render(<SeasonClock now={Date.parse('2026-10-23T12:00:00Z')} timeZone="Europe/Vienna" />);
    const clock = screen.getByRole('region', { name: 'Season clock' });
    expect(clock).toHaveTextContent('In season: Autumn');
    // 2 1/4 and then 3 contract years (365 days each) after 5 September 2021: with 2024's leap
    // day that is 4 December 2026 (in Vienna as in UTC).
    expect(clock).toHaveTextContent('Next halving: Autumn, Friday 4 December');
    // By the day only: no time of day anywhere.
    expect(clock.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    expect(clock).toHaveTextContent("Calculated from the token contracts' halving schedule.");
    expect(within(clock).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      expect.stringContaining('autumn')
    );
  });

  it('a year later the season has moved on', () => {
    render(<SeasonClock now={Date.parse('2027-10-23T12:00:00Z')} timeZone="Europe/Vienna" />);
    // By then Autumn (December 2026, to 30) and Winter (September 2027, to 26.25) have halved;
    // Spring (42 until June 2028) produces fastest.
    const clock = screen.getByRole('region', { name: 'Season clock' });
    expect(clock).toHaveTextContent('In season: Spring');
    expect(clock).toHaveTextContent('Next halving: Spring, Sunday 4 June 2028');
  });
});
