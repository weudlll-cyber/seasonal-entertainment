// ============================================================
// File:        startPage.test.jsx
// Path:        client/src/pages/startPage.test.jsx
// Project:     Seasonal Entertainment
// Description: The Start here page (/start): five steps in order, each with its button to a
//              page the site has (the e2e test follows them: client/e2e/start.spec.js); the
//              last one leads to the next call when one is live or planned, else to the Calls
//              page; the notice "Information only — not financial advice." with its link.
// ============================================================

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GUEST, mockApi } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const CALLS = (upcoming) => ({
  'GET /calls': {
    body: {
      ok: true,
      configured: true,
      reminders: [],
      calls: { live: [], upcoming, recent: [] },
    },
  },
});
const buttons = async () => {
  const steps = await screen.findByRole('list', { name: 'Steps' });
  return within(steps)
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);
};

describe('Start here', () => {
  it('five steps with their buttons, and the notice', async () => {
    mockApi({ ...GUEST, ...CALLS([]) });
    await renderApp('/start');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Start here' })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Steps' }))
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent)
    ).toEqual([
      'What are Seasonal Tokens',
      'How it works',
      'Know the risks',
      'See the prices and the fair price',
      'Join the chat and the next call',
    ]);
    expect(await buttons()).toEqual([
      ['What are Seasonal Tokens', '/info/what-are-seasonal-tokens'],
      ['How it works', '/info/how-it-works'],
      ['Risks', '/info/risks'],
      ['Prices and fair price', '/info/prices'],
      ['Open the chat', '/chat'],
      ['Calls', '/calls'],
    ]);
    const notice = screen.getByText(/Information only — not financial advice\./);
    expect(within(notice).getByRole('link', { name: 'Disclaimer' })).toHaveAttribute(
      'href',
      '/info/disclaimer'
    );
  });

  it('the last step leads to the next call when one is planned', async () => {
    mockApi({
      ...GUEST,
      ...CALLS([
        { id: 12, title: 'AMA', status: 'scheduled', scheduledFor: '2026-10-30T18:00:00Z' },
      ]),
    });
    await renderApp('/start');
    expect(await screen.findByRole('link', { name: 'The next call: AMA' })).toHaveAttribute(
      'href',
      '/calls/12'
    );
  });
});
