// ============================================================
// File:        globalSetup.js
// Path:        client/e2e/globalSetup.js
// Project:     Seasonal Entertainment
// Description: Playwright global setup (runs once, after the test server is up): creates the
//              run's admin through the real bootstrap route, turns on its 2FA, and saves its
//              logged-in browser state for the specs that act as admin (adminState.js).
// ============================================================

import { request } from '@playwright/test';
import { codeForStep, stepAt } from '../../server/src/twofa/totp.js';
import { ADMIN, ADMIN_STATE } from './adminState.js';

export default async function globalSetup(config) {
  const { baseURL } = config.projects[0].use;
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const boot = await api.post('/api/auth/bootstrap', {
    headers: { 'x-bootstrap-token': 'e2e-bootstrap-token' },
    data: ADMIN,
  });
  if (boot.status() !== 201) throw new Error(`e2e bootstrap failed: ${boot.status()}`);
  const { secret } = await (await api.post('/api/2fa/setup')).json();
  const enable = await api.post('/api/2fa/enable', {
    data: { code: codeForStep(secret, stepAt(Date.now())) },
  });
  if (enable.status() !== 200) throw new Error(`e2e 2FA setup failed: ${enable.status()}`);
  await api.storageState({ path: ADMIN_STATE });
  await api.dispose();
}
