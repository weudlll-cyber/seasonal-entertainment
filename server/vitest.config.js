// ============================================================
// File:        vitest.config.js
// Path:        server/vitest.config.js
// Project:     Seasonal Entertainment
// Description: Vitest configuration for the server tests.
// ============================================================

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // As in the client: tests that log in derive keys with Argon2id (about 64 MiB each,
    // helpers/accountKeys.js); under the full parallel verify that alone can pass 5 s.
    testTimeout: 15_000,
  },
});
