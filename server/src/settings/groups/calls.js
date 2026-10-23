// ============================================================
// File:        calls.js
// Path:        server/src/settings/groups/calls.js
// Project:     Seasonal Entertainment
// Description: The "Calls" group of site settings (definitions.js): how many speak and how
//              many take part in one call.
// ============================================================

export const CALL_SETTINGS = {
  // Up to 10 speakers (decided 2026-10-18). At least 1, or no one could speak; at most 25,
  // since every listener receives every speaker's video and sound.
  'calls.maxSpeakers': {
    type: 'integer',
    label: 'Speakers on stage at most',
    help: 'How many can speak at once in one call; hosts count too.',
    unit: 'speakers',
    default: 10,
    min: 1,
    max: 25,
  },
  // 100-200 listeners with room to spare (decided 2026-10-18). At least 2, or a host could not
  // meet anyone; at most 1000, the call service's UDP range is sized for 250 (docs/CALLS.md,
  // "Ports and firewall") and more needs a bigger server first.
  'calls.maxParticipants': {
    type: 'integer',
    label: 'Participants per call at most',
    help: 'Speakers and listeners together; the call service refuses anyone beyond it.',
    unit: 'people',
    default: 250,
    min: 2,
    max: 1000,
  },
};
