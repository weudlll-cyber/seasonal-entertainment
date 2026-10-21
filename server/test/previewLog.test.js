// ============================================================
// File:        previewLog.test.js
// Path:        server/test/previewLog.test.js
// Project:     Seasonal Entertainment
// Description: When a link preview fails unexpectedly (here: saving it), the server log names
//              only the link's host, never its path or query, which may carry someone's token
//              (server/src/previews/service.js). A fetch that simply fails is not logged at all.
// ============================================================

import { afterEach, expect, it, vi } from 'vitest';
import { chatApp } from './helpers/chat.js';
import { PUBLIC_IP, html, previewInternet } from './helpers/previewNet.js';
import { registerUser } from './helpers/testApp.js';

// Saving the preview fails: the one unexpected error on the way to a card.
vi.mock('../src/previews/store.js', async (original) => ({
  ...(await original()),
  savePreview: () => {
    throw new Error('disk full');
  },
}));

let t;
let internet;
afterEach(async () => {
  t?.close();
  await internet?.close();
  vi.restoreAllMocks();
});

it("logs an unexpected preview failure by the link's host only", async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  internet = await previewInternet(
    { 'site.test/private': html('<title>Private</title>') },
    { 'site.test': [PUBLIC_IP] }
  );
  t = chatApp({}, { previewNetwork: internet.network });
  const { agent } = await registerUser(t, 'mia');
  await agent
    .post('/api/chat/rooms/general/messages')
    .send({ body: 'https://site.test/private?token=secret-canary-77' });

  await vi.waitFor(() => expect(warn).toHaveBeenCalled(), { timeout: 5000 });
  const logged = warn.mock.calls.flat().join(' ');
  expect(logged).toContain('site.test');
  expect(logged).toContain('disk full');
  expect(logged).not.toContain('secret-canary-77');
  expect(logged).not.toContain('/private');
});
