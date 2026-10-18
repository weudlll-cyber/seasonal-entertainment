// ============================================================
// File:        definitions.js
// Path:        server/src/settings/definitions.js
// Project:     Seasonal Entertainment
// Description: Every admin-editable site setting: its label for the admin page, default and
//              allowed range. Whole numbers only so far. An area adds its settings here.
// ============================================================

export const SETTINGS = {
  // Calls (decided 2026-10-18): up to 10 speakers; 100-200 listeners, with room to spare.
  'calls.maxSpeakers': { label: 'Calls: speakers on stage at most', default: 10, min: 1, max: 25 },
  'calls.maxParticipants': {
    label: 'Calls: participants per call at most',
    default: 250,
    // The call service's UDP range is sized for 250 (docs/CALLS.md, "Ports and firewall").
    min: 2,
    max: 1000,
  },
};
