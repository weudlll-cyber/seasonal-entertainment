// ============================================================
// File:        openRounds.spec.js
// Path:        client/e2e/openRounds.spec.js
// Project:     Seasonal Entertainment
// Description: Games' open sign-ups in a real browser (docs/OPEN-ROUNDS.md): a game whose status
//              URL is the fake host status.games.test (answered by the run's server from a file
//              beside its database, server/src/games/statusFixture.js) leads the home page's
//              Featured game box for a guest with "Sign-up open" and Join, the box moves on to the
//              next game after 8 seconds, and the games page's card shows the badge. The game and
//              the file are removed afterwards, so no other spec sees them.
// ============================================================

import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

const FIXTURE = path.join(process.env.SE_E2E_DIR, 'game-status-fixture.json');
const NAME = 'Open rounds e2e';
const ROUND = {
  id: 'e2e',
  title: 'E2E Royale',
  kind: 'Seasonal Bingo Royale',
  startsAt: '2099-01-01T19:00:00Z',
  signupClosesAt: null,
  players: 7,
  maxPlayers: 40,
  joinUrl: 'https://status.games.test/rounds/e2e',
};

test('the Featured game box leads with an open sign-up and rotates; the games page shows the badge', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  writeFileSync(FIXTURE, JSON.stringify({ version: 1, rounds: [ROUND] }));
  const admin = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const created = await admin.post('/api/admin/games', {
    data: {
      name: NAME,
      description: 'A game with an open sign-up.',
      image: 'summer',
      status: 'available',
      path: '/games/open-rounds-e2e',
      visibility: 'everyone',
      statusUrl: 'https://status.games.test/open-rounds',
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).game;
  try {
    // The save reads the status at once (in the background).
    await expect
      .poll(async () => {
        const { games } = await (await admin.get('/api/games')).json();
        return games.find((g) => g.id === id)?.openRounds?.length;
      })
      .toBe(1);

    await page.goto('/');
    const box = page.getByRole('region', { name: 'Featured game' });
    await expect(box.getByRole('heading', { level: 2, name: NAME })).toBeVisible();
    await expect(box.getByText('Sign-up open')).toBeVisible();
    await expect(box.getByText(/7 \/ 40 players/)).toBeVisible();
    await expect(box.getByRole('link', { name: 'Join E2E Royale' })).toHaveAttribute(
      'href',
      ROUND.joinUrl
    );
    // 8 seconds on, the next game (the run's other games come after the open one).
    await expect(box.getByRole('heading', { level: 2, name: NAME })).toBeHidden({
      timeout: 12_000,
    });

    await page.goto('/games');
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: NAME }) });
    await expect(card.getByText('Sign-up open')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Join E2E Royale' })).toBeVisible();
  } finally {
    await admin.delete(`/api/admin/games/${id}`);
    rmSync(FIXTURE, { force: true });
    await admin.dispose();
  }
});
