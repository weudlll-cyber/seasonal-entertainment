// ============================================================
// File:        recordingLabel.js
// Path:        client/src/calls/recordingLabel.js
// Project:     Seasonal Entertainment
// Description: What a call says about its recording (docs/CALLS.md, "Recording"): until the
//              egress records "Recording starts…" ("starting", the button's) or "Recording starts
//              when someone speaks…" ("waiting", one started with the call), then the place's
//              own word ("Recording" in the call, "Being recorded" beside it). One place for the
//              words.
// ============================================================

export const RECORDING_STARTS = 'Recording starts…';
export const RECORDING_WAITS = 'Recording starts when someone speaks…';
export const RECORDING_FAILED = 'The recording did not start. Try again.';

const NOT_YET = { starting: RECORDING_STARTS, waiting: RECORDING_WAITS };

// state: 'starting' | 'waiting' | 'active' | null (a server from before the states: none, read
// as active); active: the place's own word once it records.
export const recordingLabel = (state, active) => NOT_YET[state] ?? active;
