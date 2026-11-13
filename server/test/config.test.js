// ============================================================
// File:        config.test.js
// Path:        server/test/config.test.js
// Project:     Seasonal Entertainment
// Description: Guards that the listen address comes from the environment at start time, and
//              how the BOT_ADMIN_EMBEDDED switch is read (1 on; 0 or unset off; else an error),
//              the read limits per address (API_READS_PER_MINUTE, 1200 unless set;
//              BOT_READS_PER_MINUTE, 120 unless set) and where the
//              deletion journal lies (beside the database unless DELETION_JOURNAL is set).
// ============================================================

import path from 'node:path';
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

  it('reads the read limit per address, 1200 a minute unless set', () => {
    expect(readConfig({}).rateLimits.apiRead).toEqual({ windowMs: 60_000, max: 1200 });
    expect(readConfig({ API_READS_PER_MINUTE: '100000' }).rateLimits.apiRead.max).toBe(100000);
    expect(() => readConfig({ API_READS_PER_MINUTE: '10' })).toThrow(/API_READS_PER_MINUTE/);
  });

  it("reads the bots' read limit per address, 120 a minute unless set", () => {
    expect(readConfig({}).rateLimits.botRead).toEqual({ windowMs: 60_000, max: 120 });
    expect(readConfig({ BOT_READS_PER_MINUTE: '100000' }).rateLimits.botRead.max).toBe(100000);
    expect(() => readConfig({ BOT_READS_PER_MINUTE: '5' })).toThrow(/BOT_READS_PER_MINUTE/);
  });

  it('keeps the deletion journal beside the database unless set', () => {
    const config = readConfig({ DATABASE_PATH: '/srv/site/seasonal.db' });
    expect(config.deletionJournal).toBe(path.resolve('/srv/site/account-deletions.jsonl'));
    expect(readConfig({ DELETION_JOURNAL: '/srv/journal.jsonl' }).deletionJournal).toBe(
      path.resolve('/srv/journal.jsonl')
    );
  });
});
