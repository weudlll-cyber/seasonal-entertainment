// ============================================================
// File:        setup.js
// Path:        client/src/test/setup.js
// Project:     Seasonal Entertainment
// Description: Vitest setup for client tests: DOM matchers and a clean DOM between tests.
// ============================================================

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
