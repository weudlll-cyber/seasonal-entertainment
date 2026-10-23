// ============================================================
// File:        adminRecap.test.jsx
// Path:        client/src/admin/adminRecap.test.jsx
// Project:     Seasonal Entertainment
// Description: The admin chat page's "Post recap now": asks the server to post the weekly
//              recap at once and says where it went.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { mockApi } from '../test/mockApi.js';
import AdminRecap from './AdminRecap.jsx';

it('"Post recap now" posts it and says in which room', async () => {
  const calls = mockApi({
    'POST /admin/recap': {
      status: 201,
      body: { ok: true, message: { id: 5, room: 'announcements' } },
    },
  });
  render(<AdminRecap />);
  fireEvent.click(screen.getByRole('button', { name: 'Post recap now' }));
  expect(await screen.findByText('Posted in "announcements".')).toBeInTheDocument();
  expect(calls.map((c) => c.key)).toEqual(['POST /admin/recap']);
});
