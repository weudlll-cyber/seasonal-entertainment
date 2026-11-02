// ============================================================
// File:        manageEventsPage.test.jsx
// Path:        client/src/pages/manageEventsPage.test.jsx
// Project:     Seasonal Entertainment
// Description: Manage events (/manage-events, ManageEventsPage.jsx) and its sidebar item: the
//              item only for organisers and admins and only while the server is set up for the
//              bot's admin page (features.botAdmin); the page asks /bot-admin/health and shows
//              the bot's page in a same-origin frame when it answers, the message and Retry when
//              not (Retry asks again); staff without 2FA are led to set it up, a server without
//              the feature asks nothing; members see "Not allowed".
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { staffNavFor } from '../app/navigation.js';
import { GUEST, mockApi, signedIn, withFeatures } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const ON = { botAdmin: true };
const OLGA = signedIn({ username: 'olga', role: 'organiser' });
const ADA = signedIn({ username: 'ada', role: 'admin' });
const MIA = signedIn({ username: 'mia', role: 'member' });
const HEALTHY = { 'GET /bot-admin/health': { body: { ok: true } } };
const DOWN = { 'GET /bot-admin/health': { status: 502 } };
const MESSAGE = "The event bot's admin page does not answer right now.";

beforeEach(() => localStorage.clear());

const manageLink = () =>
  within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('link', {
    name: 'Manage events',
  });

describe('the sidebar item', () => {
  it.each([
    [null, []],
    [{ role: 'member' }, []],
    [{ role: 'organiser' }, ['/banner', '/manage-events']],
    [{ role: 'admin' }, ['/admin', '/manage-events']],
  ])('set up, %o: %o', (user, targets) => {
    expect(staffNavFor(user, ON).map((item) => item.to)).toEqual(targets);
  });

  it('not set up: no staff account gets it', () => {
    for (const role of ['organiser', 'admin']) {
      const targets = staffNavFor({ role }, { botAdmin: false }).map((item) => item.to);
      expect(targets).not.toContain('/manage-events');
    }
  });

  it('an organiser sees it in the sidebar while the server is set up for it', async () => {
    mockApi(withFeatures(OLGA, ON));
    await renderApp('/games');
    await screen.findByRole('link', { name: 'Site banner' });
    expect(manageLink()).toHaveAttribute('href', '/manage-events');
  });

  it('a server without the feature: no item, even for an admin', async () => {
    mockApi(ADA);
    await renderApp('/games');
    await screen.findByRole('link', { name: 'Admin' });
    expect(manageLink()).toBeNull();
  });

  it('members and guests never see it, even when it is set up', async () => {
    for (const session of [MIA, GUEST]) {
      mockApi(withFeatures(session, ON));
      const view = await renderApp('/games');
      await screen.findByRole('heading', { level: 1 });
      expect(manageLink()).toBeNull();
      view.unmount();
    }
  });
});

describe('the page', () => {
  it('shows the bot admin page in a same-origin frame when it answers', async () => {
    const calls = mockApi({ ...withFeatures(OLGA, ON), ...HEALTHY });
    await renderApp('/manage-events');
    const frame = await screen.findByTitle('Event bot admin');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/bot-admin/admin');
    expect(calls.map((c) => c.key)).toContain('GET /bot-admin/health');
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it('says so with a Retry button when it does not answer; Retry asks again', async () => {
    const answers = { ...withFeatures(ADA, ON), ...DOWN };
    const calls = mockApi(answers);
    await renderApp('/manage-events');
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE);
    expect(screen.queryByTitle('Event bot admin')).toBeNull();
    answers['GET /bot-admin/health'] = HEALTHY['GET /bot-admin/health'];
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTitle('Event bot admin')).toHaveAttribute('src', '/bot-admin/admin');
    expect(calls.filter((c) => c.key === 'GET /bot-admin/health')).toHaveLength(2);
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it('a network failure counts as no answer', async () => {
    mockApi(withFeatures(OLGA, ON)); // the health check is not answered: fetch rejects
    await renderApp('/manage-events');
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE);
  });

  it('staff without 2FA are led to set it up; nothing is asked', async () => {
    const olga = signedIn({ username: 'olga', role: 'organiser', twoFactorRequired: true });
    const calls = mockApi(withFeatures(olga, ON));
    await renderApp('/manage-events');
    expect(await screen.findByRole('link', { name: 'Set it up' })).toHaveAttribute(
      'href',
      '/account#two-factor'
    );
    expect(calls.map((c) => c.key)).not.toContain('GET /bot-admin/health');
    expect(screen.queryByTitle('Event bot admin')).toBeNull();
  });

  it('a server without the feature: the page says so and asks nothing', async () => {
    const calls = mockApi(ADA);
    await renderApp('/manage-events');
    expect(
      await screen.findByText("The event bot's admin page is not set up on this site.")
    ).toBeInTheDocument();
    expect(calls.map((c) => c.key)).not.toContain('GET /bot-admin/health');
  });

  it('members see "Not allowed"', async () => {
    const calls = mockApi(withFeatures(MIA, ON));
    await renderApp('/manage-events');
    expect(await screen.findByRole('heading', { name: 'Not allowed' })).toBeInTheDocument();
    expect(calls.map((c) => c.key)).not.toContain('GET /bot-admin/health');
  });
});
