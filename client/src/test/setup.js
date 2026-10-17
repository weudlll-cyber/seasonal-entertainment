// ============================================================
// File:        setup.js
// Path:        client/src/test/setup.js
// Project:     Seasonal Entertainment
// Description: Vitest setup for client tests: DOM matchers, and a clean DOM and real
//              globals (fetch) between tests.
// ============================================================

import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// findBy* waits up to 5 s instead of 1 s: a busy machine (e.g. during the full verify) must
// not turn a correct screen into a failure. A real failure still fails, just later.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
