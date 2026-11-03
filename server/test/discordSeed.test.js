// ============================================================
// File:        discordSeed.test.js
// Path:        server/test/discordSeed.test.js
// Project:     Seasonal Entertainment
// Description: The Discord steps shipped with the project (docs/AUTH.md, "Discord: steps"):
//              a database that never had a step gets the seed (server/src/discord/seed/), its
//              icons through the upload pipeline (one it refuses is left out, the step kept);
//              existing steps are never touched, admins' edits stay, an emptied list stays
//              empty; the shipped seed is well-formed and holds steps only. The export
//              (scripts/export-steps.mjs, `npm run steps:export`) writes a database's steps
//              read-only, and its output seeds a fresh database to the same steps and icons.
// ============================================================

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { LADDERS, STEP_SEED_FILE, readStepSeed, seedSteps } from '../src/discord/steps.js';
import { seedTestSteps } from './helpers/steps.js';
import { makeTestApp } from './helpers/testApp.js';

const script = fileURLToPath(new URL('../../scripts/export-steps.mjs', import.meta.url));
let t;
let dir;
afterEach(() => {
  t?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

const ROLE = '1110866352857690112';
const storeIcon = () => t.app.locals.chat.images.storeIcon;
const stored = () =>
  t.db
    .prepare(
      `SELECT ladder, name, position, role_id AS roleId, icon_file AS iconFile
       FROM discord_steps ORDER BY ladder, position`
    )
    .all();
const png = () =>
  sharp({ create: { width: 90, height: 90, channels: 4, background: '#c08000' } })
    .png()
    .toBuffer();

// A seed folder of its own: steps.json and icons/.
function seedFolder(steps, icons = {}) {
  dir = mkdtempSync(path.join(tmpdir(), 'se-stepseed-'));
  mkdirSync(path.join(dir, 'icons'));
  for (const [name, bytes] of Object.entries(icons)) {
    writeFileSync(path.join(dir, 'icons', name), bytes);
  }
  const file = path.join(dir, 'steps.json');
  writeFileSync(file, JSON.stringify({ description: 'test', steps }));
  return pathToFileURL(file);
}

describe('the seed at the first start', () => {
  it('fills a database that never had a step: names, order, role ids, icons', async () => {
    t = makeTestApp();
    const file = seedFolder(
      [
        { ladder: 'holder', name: 'Holder', position: 1, roleId: null, icon: null },
        { ladder: 'holder', name: 'Whale', position: 2, roleId: ROLE, icon: 'holder-2.png' },
        { ladder: 'investor', name: 'Level 1', position: 1, roleId: null, icon: null },
      ],
      { 'holder-2.png': await png() }
    );
    expect(await seedSteps(t.db, { seed: readStepSeed(file), storeIcon: storeIcon() })).toBe(3);
    const rows = stored();
    expect(rows.map(({ iconFile: _icon, ...row }) => row)).toEqual([
      { ladder: 'holder', name: 'Holder', position: 1, roleId: null },
      { ladder: 'holder', name: 'Whale', position: 2, roleId: ROLE },
      { ladder: 'investor', name: 'Level 1', position: 1, roleId: null },
    ]);
    // The icon went through the upload pipeline: a 64 x 64 WebP in the media folder.
    const whale = rows.find((r) => r.name === 'Whale');
    expect(whale.iconFile).toMatch(/^step-icons\/[0-9a-f]{32}\.webp$/);
    const icon = readFileSync(path.join(t.config.mediaDir, whale.iconFile));
    expect(await sharp(icon).metadata()).toMatchObject({ format: 'webp', width: 64, height: 64 });
  });

  it('keeps a step whose icon the pipeline refuses, without the icon', async () => {
    t = makeTestApp();
    const file = seedFolder(
      [{ ladder: 'holder', name: 'Holder', position: 1, roleId: null, icon: 'bad.svg' }],
      { 'bad.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>' }
    );
    expect(await seedSteps(t.db, { seed: readStepSeed(file), storeIcon: storeIcon() })).toBe(1);
    expect(stored()).toEqual([
      { ladder: 'holder', name: 'Holder', position: 1, roleId: null, iconFile: null },
    ]);
  });

  it('never touches existing steps: admins’ edits stay, an emptied list stays empty', async () => {
    t = makeTestApp();
    await seedTestSteps(t.db);
    t.db
      .prepare("UPDATE discord_steps SET name = 'Gold', role_id = ? WHERE name = 'Golden'")
      .run(ROLE);
    const before = stored();
    expect(await seedSteps(t.db, { storeIcon: storeIcon() })).toBe(0);
    expect(stored()).toEqual(before);
    t.db.prepare('DELETE FROM discord_steps').run();
    expect(await seedSteps(t.db, { storeIcon: storeIcon() })).toBe(0);
    expect(stored()).toEqual([]);
  });
});

describe('the seed the project ships', () => {
  it('is well-formed and holds steps only', () => {
    const { steps } = JSON.parse(readFileSync(STEP_SEED_FILE, 'utf8'));
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(Object.keys(step).sort()).toEqual(['icon', 'ladder', 'name', 'position', 'roleId']);
      expect(LADDERS).toContain(step.ladder);
      expect(step.name.trim().length).toBeGreaterThan(0);
      expect(step.name.length).toBeLessThanOrEqual(40);
      expect(step.roleId === null || /^\d{17,20}$/.test(step.roleId)).toBe(true);
    }
    // Positions 1, 2, … per ladder; role ids unique, as the database requires.
    for (const ladder of LADDERS) {
      const positions = steps.filter((s) => s.ladder === ladder).map((s) => s.position);
      expect(positions).toEqual(positions.map((_p, index) => index + 1));
    }
    const roleIds = steps.map((s) => s.roleId).filter(Boolean);
    expect(new Set(roleIds).size).toBe(roleIds.length);
    // Every icon named is there (reading the seed reads them).
    expect(readStepSeed().filter((s) => s.icon).length).toBe(steps.filter((s) => s.icon).length);
  });

  it('seeds a fresh database through the real pipeline', async () => {
    t = makeTestApp();
    const seed = readStepSeed();
    expect(await seedSteps(t.db, { storeIcon: storeIcon() })).toBe(seed.length);
    expect(stored().filter((r) => r.iconFile).length).toBe(seed.filter((s) => s.icon).length);
  });
});

describe('the export', () => {
  it('writes a database’s steps read-only, and they seed a fresh database the same', async () => {
    t = makeTestApp();
    const file = seedFolder(
      [
        { ladder: 'farmer', name: 'Farmer Holder', position: 1, roleId: null, icon: null },
        { ladder: 'holder', name: 'Holder', position: 1, roleId: ROLE, icon: 'a.png' },
        { ladder: 'holder', name: 'Bronze', position: 3, roleId: null, icon: null },
      ],
      { 'a.png': await png() }
    );
    await seedSteps(t.db, { seed: readStepSeed(file), storeIcon: storeIcon() });
    const source = stored();
    const modified = statSync(t.config.databasePath).mtimeMs;
    const out = path.join(dir, 'out');
    const printed = execFileSync(
      process.execPath,
      [script, '--db', t.config.databasePath, '--media', t.config.mediaDir, '--out', out],
      { encoding: 'utf8' }
    );
    expect(printed).toContain('holder: 2 steps');
    expect(printed).toContain('farmer: 1 steps');
    expect(statSync(t.config.databasePath).mtimeMs).toBe(modified);

    const written = JSON.parse(readFileSync(path.join(out, 'steps.json'), 'utf8')).steps;
    // Ladder order, positions without gaps, the icon under a stable name.
    expect(written).toEqual([
      { ladder: 'holder', name: 'Holder', position: 1, roleId: ROLE, icon: 'holder-1.webp' },
      { ladder: 'holder', name: 'Bronze', position: 2, roleId: null, icon: null },
      { ladder: 'farmer', name: 'Farmer Holder', position: 1, roleId: null, icon: null },
    ]);
    const iconCopy = readFileSync(path.join(out, 'icons', 'holder-1.webp'));
    const iconSource = source.find((r) => r.name === 'Holder').iconFile;
    expect(iconCopy.equals(readFileSync(path.join(t.config.mediaDir, iconSource)))).toBe(true);

    // Round trip: the export seeds a fresh database to the same steps.
    t.close();
    t = makeTestApp();
    const again = readStepSeed(pathToFileURL(path.join(out, 'steps.json')));
    await seedSteps(t.db, { seed: again, storeIcon: storeIcon() });
    const strip = (rows) => rows.map(({ iconFile, ...row }) => ({ ...row, icon: !!iconFile }));
    expect(strip(stored())).toEqual(
      strip(source).map((row) => (row.name === 'Bronze' ? { ...row, position: 2 } : row))
    );
  });
});
