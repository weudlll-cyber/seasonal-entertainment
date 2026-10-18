// ============================================================
// File:        callSpotlightResilience.test.js
// Path:        server/test/callSpotlightResilience.test.js
// Project:     Seasonal Entertainment
// Description: The eye test of 2026-10-18 (SE-CALLS-2): the dev database's calls table had been
//              created before the spotlight columns existed, so every spotlight request failed
//              with "no such column: spotlight_identity" and the presenter saw "Something went
//              wrong on the server.". Guards: an older calls table gains the columns on start;
//              a failing spotlight update (database or call service) is logged with its details,
//              answers a generic message only, and leaves the call working.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNTS_SCHEMA } from '../src/accounts/schema.js';
import { openDatabase } from '../src/db/database.js';
import { callApp, join, liveCall, organiser } from './helpers/calls.js';

let t;
let dir;
afterEach(() => {
  t?.close();
  t = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
  vi.restoreAllMocks();
});

// The calls table as the first version of the calls area created it (SE-CALLS-1 piece 2).
const FIRST_CALLS_TABLE = `
CREATE TABLE calls (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_for TEXT, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, started_at TEXT, ended_at TEXT,
  chat_room_id INTEGER, room_name TEXT NOT NULL UNIQUE
);`;

function olderDatabase() {
  dir = mkdtempSync(path.join(tmpdir(), 'se-old-calls-'));
  const file = path.join(dir, 'old.db');
  const db = new Database(file);
  db.exec(ACCOUNTS_SCHEMA + FIRST_CALLS_TABLE);
  db.close();
  return file;
}

describe('an older calls table', () => {
  it('gains the spotlight columns on start', () => {
    const db = openDatabase(olderDatabase());
    const columns = db
      .prepare('PRAGMA table_info(calls)')
      .all()
      .map((c) => c.name);
    db.close();
    expect(columns).toEqual(expect.arrayContaining(['spotlight_identity', 'spotlight_by']));
  });

  it('serves a screen share report, as in the eye test', async () => {
    ({ t } = callApp({ databasePath: olderDatabase() }));
    const olga = await organiser(t);
    const call = await liveCall(olga);
    const res = await olga.post(`/api/calls/${call.id}/join`);
    expect(res.status).toBe(200);
    const shared = await olga.post(`/api/calls/${call.id}/spotlight/share`).send({ sharing: true });
    expect(shared.status).toBe(200);
    expect(shared.body.spotlight).toMatchObject({ by: 'share' });
  });
});

describe('a failing spotlight update', () => {
  it('is logged with its details, answers generically and leaves the call working', async () => {
    let service;
    ({ t, service } = callApp());
    const olga = await organiser(t);
    const call = await liveCall(olga);
    await join(olga, service, call);
    service.setRoomMetadata = async () => {
      throw new Error('call service unreachable: ECONNREFUSED');
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await olga.post(`/api/calls/${call.id}/spotlight/share`).send({ sharing: true });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      ok: false,
      error: 'spotlight_unavailable',
      message: 'The spotlight could not be changed right now.',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED/);
    expect(logged.mock.calls.flat().join(' ')).toMatch(/spotlight.*ECONNREFUSED/s);
    // The call goes on: joining and raising hands still work.
    expect((await olga.post(`/api/calls/${call.id}/join`)).status).toBe(200);
  });
});
