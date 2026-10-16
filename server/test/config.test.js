// ============================================================
// File:        config.test.js
// Path:        server/test/config.test.js
// Project:     Seasonal Entertainment
// Description: Guards that the listen address comes from the environment at start time.
// ============================================================

import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';

describe('readConfig', () => {
  it('takes host and port from the environment', () => {
    const config = readConfig({ HOST: '0.0.0.0', PORT: '4321' });
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(4321);
  });

  it('falls back to 127.0.0.1:3800', () => {
    expect(readConfig({})).toMatchObject({ host: '127.0.0.1', port: 3800 });
  });

  it('rejects a port that is not a valid number', () => {
    expect(() => readConfig({ PORT: 'eighty' })).toThrow(/PORT/);
  });
});
