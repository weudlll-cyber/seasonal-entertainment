// ============================================================
// File:        infoPages.test.jsx
// Path:        client/src/pages/infoPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the info screens: the public index and one page (404 for drafts and
//              unknown slugs), and the admin editor's live preview and save. The lazy info page
//              is loaded up front (see the import below).
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
// The info page (with the Markdown renderer, the client's heaviest module to load) is lazy in
// the app. Loaded here once while the file is collected, so its first, cold load does not
// fall inside a test's timed wait; the route then gets it from the module cache.
import './InfoPage.jsx';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('public info pages', () => {
  it('lists published pages and opens one', async () => {
    mockApi({
      ...GUEST,
      'GET /info': { body: { ok: true, pages: [{ slug: 'faq', title: 'FAQ' }] } },
      'GET /info/faq': {
        body: { ok: true, page: { slug: 'faq', title: 'FAQ', body: '## First question' } },
      },
    });
    renderAt('/info');
    fireEvent.click(await screen.findByRole('link', { name: 'FAQ' }));
    // By name: the page itself loads on first use (lazy), so wait for its own heading.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'First question' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('FAQ');
  });

  it('shows the 404 page for a draft or unknown slug', async () => {
    mockApi({
      ...GUEST,
      'GET /info/secret-draft': { status: 404, body: { ok: false, error: 'not_found' } },
    });
    renderAt('/info/secret-draft');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('info editor', () => {
  it('previews the Markdown while typing and saves a new page', async () => {
    const calls = mockApi({
      ...signedIn({ id: 1, username: 'ada', role: 'admin' }),
      'POST /admin/info': {
        status: 201,
        body: {
          ok: true,
          page: { id: 7, slug: 'faq', title: 'FAQ', body: '## Q', status: 'draft' },
        },
      },
      'GET /admin/info/7': {
        body: {
          ok: true,
          page: { id: 7, slug: 'faq', title: 'FAQ', body: '## Q', status: 'draft' },
        },
      },
    });
    renderAt('/admin/info/new');
    fireEvent.change(await screen.findByLabelText('Address'), { target: { value: 'faq' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'FAQ' } });
    fireEvent.change(screen.getByLabelText('Text (Markdown)'), { target: { value: '## Q' } });
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(preview.querySelector('h2')).toHaveTextContent('Q');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /admin/info').body).toEqual({
      slug: 'faq',
      title: 'FAQ',
      body: '## Q',
    });
  });
});
