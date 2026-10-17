// ============================================================
// File:        setup.js
// Path:        client/src/test/setup.js
// Project:     Seasonal Entertainment
// Description: Vitest setup for client tests: DOM matchers, and a clean DOM and real
//              globals (fetch) between tests.
// ============================================================

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
