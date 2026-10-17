// ============================================================
// File:        adminState.js
// Path:        client/e2e/adminState.js
// Project:     Seasonal Entertainment
// Description: Where the e2e run's admin login is kept (inside the run's temporary directory)
//              and who that admin is. Specs acting as admin use test.use({ storageState }).
// ============================================================

import path from 'node:path';

export const ADMIN = {
  username: 'e2eadmin',
  email: 'e2eadmin@example.org',
  password: 'correct-horse-1',
};

export const ADMIN_STATE = path.join(process.env.SE_E2E_DIR, 'admin-state.json');
