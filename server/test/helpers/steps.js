// ============================================================
// File:        steps.js
// Path:        server/test/helpers/steps.js
// Project:     Seasonal Entertainment
// Description: Test helper: a fixed set of Discord steps (the three ladders' names of 2026-11-02,
//              no role ids, no icons) for tests that need steps, independent of the seed the
//              project ships (server/src/discord/seed/steps.json changes with the owner's
//              export, scripts/export-steps.mjs).
// ============================================================

import { seedSteps } from '../../src/discord/steps.js';

const NAMES = {
  holder: [
    'Holder',
    'Bronze',
    'Silver',
    'Golden',
    'Platinum',
    'Diamond',
    'Seasonal',
    'Ultimate',
    'Ultimate-Dragon Whale',
  ],
  farmer: [
    'Farmer Holder',
    'Farmer Bronze',
    'Farmer Silver',
    'Farmer Golden',
    'Farmer Platinum',
    'Farmer Diamond',
    'Farmer Seasonal',
    'Ultimate-Farmer Whale',
  ],
  investor: ['Level 1', 'Level 2', 'Level 3', 'Level 4'],
};

export const TEST_STEPS = Object.entries(NAMES).flatMap(([ladder, names]) =>
  names.map((name, index) => ({ ladder, name, position: index + 1, roleId: null, icon: null }))
);

// The test steps, once (as the server's start does with the shipped seed).
export const seedTestSteps = (db) => seedSteps(db, { seed: TEST_STEPS });
