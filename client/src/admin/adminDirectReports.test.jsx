// ============================================================
// File:        adminDirectReports.test.jsx
// Path:        client/src/admin/adminDirectReports.test.jsx
// Project:     Seasonal Entertainment
// Description: The moderators' view of reported private conversations: reason and names for
//              every report; shared copies only on request (the server audits each view) and
//              labelled as content provided by the reporter; no copies to show when nothing was
//              shared; "Mark reviewed" closes a report.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { formatWhen } from '../app/dates.js';
import { mockApi } from '../test/mockApi.js';
import AdminDirectReports, { SHARED_LABEL } from './AdminDirectReports.jsx';

const report = (id, shared) => ({
  id,
  reporter: 'mia',
  partner: 'zoe',
  reason: `reason ${id}`,
  createdAt: '2026-10-18T09:00:00.000Z',
  shared,
});

it('shows shared copies on request, labelled; closes reports as reviewed', async () => {
  let open = [report(1, 2), report(2, 0)];
  const calls = mockApi({
    'GET /chat/direct-reports': () => ({ body: { ok: true, reports: open } }),
    'GET /chat/direct-reports/1/copies': {
      body: {
        ok: true,
        copies: [
          {
            messageId: 10,
            author: 'zoe',
            text: 'the rude one',
            sentAt: '2026-10-18T08:00:00.000Z',
          },
        ],
      },
    },
    'POST /chat/direct-reports/2/reviewed': () => {
      open = [report(1, 2)];
      return { body: { ok: true } };
    },
  });
  render(<AdminDirectReports />);
  const first = (await screen.findByText('reason 1')).closest('li');
  const second = screen.getByText('reason 2').closest('li');
  expect(second).toHaveTextContent('(no messages shared)');
  expect(within(second).queryByRole('button', { name: 'Show shared messages' })).toBeNull();
  // Nothing is fetched before a moderator asks for it.
  expect(calls.some((c) => c.key.includes('/copies'))).toBe(false);
  expect(screen.queryByText('the rude one')).toBeNull();

  fireEvent.click(within(first).getByRole('button', { name: 'Show shared messages' }));
  expect(await within(first).findByText(SHARED_LABEL)).toBeInTheDocument();
  expect(within(first).getByRole('list', { name: 'Shared messages' })).toHaveTextContent(
    `zoe (${formatWhen('2026-10-18T08:00:00.000Z').replace(/\s/g, ' ')}): the rude one`
  );

  fireEvent.click(within(second).getByRole('button', { name: 'Mark reviewed' }));
  await vi.waitFor(() => expect(screen.queryByText('reason 2')).toBeNull());
  expect(screen.getByText('reason 1')).toBeInTheDocument();
});
