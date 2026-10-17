// ============================================================
// File:        chatGuestNames.test.js
// Path:        server/test/chatGuestNames.test.js
// Project:     Seasonal Entertainment
// Description: Guards the route when no free guest name can be found: a clear 503, never a
//              500. The store is mocked to report exhaustion (impossible in practice with
//              about a billion names), so this file holds only that case.
// ============================================================

import { afterEach, expect, it, vi } from 'vitest';
import { chatApp, post } from './helpers/chat.js';

vi.mock('../src/chat/store.js', async (importOriginal) => ({
  ...(await importOriginal()),
  assignGuestName: () => null,
}));

let t;
afterEach(() => t?.close());

it('answers 503 when no guest name is free', async () => {
  t = chatApp();
  const res = await post(t.client(), 'general', 'hello');
  expect(res.status).toBe(503);
  expect(res.body.error).toBe('guest_names_exhausted');
});
