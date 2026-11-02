// ============================================================
// File:        config.test.js
// Path:        server/test/config.test.js
// Project:     Seasonal Entertainment
// Description: Guards that the listen address comes from the environment at start time, and
//              how the BOT_ADMIN_EMBEDDED switch is read (1 on; 0 or unset off; else an error).
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

  it('reads BOT_ADMIN_EMBEDDED as 1 or 0, off by default', () => {
    expect(readConfig({}).botAdminEmbedded).toBe(false);
    expect(readConfig({ BOT_ADMIN_EMBEDDED: '0' }).botAdminEmbedded).toBe(false);
    expect(readConfig({ BOT_ADMIN_EMBEDDED: '1' }).botAdminEmbedded).toBe(true);
    // A typo must not silently leave the page off (or on).
    expect(() => readConfig({ BOT_ADMIN_EMBEDDED: 'yes' })).toThrow(/BOT_ADMIN_EMBEDDED/);
  });
});
