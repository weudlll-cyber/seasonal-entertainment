// ============================================================
// File:        setup.js
// Path:        client/src/test/setup.js
// Project:     Seasonal Entertainment
// Description: Vitest setup for client tests: DOM matchers, and a clean DOM, no leftover
//              chat connection and real globals (fetch) between tests.
// ============================================================

import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// findBy* and waitFor wait up to 15 s instead of 1 s: tests derive keys with Argon2id, and a
// heavily loaded machine (the full verify, other work running beside it) must not turn a correct
// screen into a failure. A real failure still fails, just later.
configure({ asyncUtilTimeout: 15_000 });

afterEach(async () => {
  cleanup();
  // Let timers started by unmounting run now: the chat module closes its shared socket on a
  // 0 ms timer, and that socket must not carry over into the next test.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
});
