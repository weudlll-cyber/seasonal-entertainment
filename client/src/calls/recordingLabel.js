// ============================================================
// File:        recordingLabel.js
// Path:        client/src/calls/recordingLabel.js
// Project:     Seasonal Entertainment
// Description: What a call says about its recording (docs/CALLS.md, "Recording"): until the
//              egress records ("starting") "Recording starts…", then the place's own word
//              ("Recording" in the call, "Being recorded" beside it). One place for the words.
// ============================================================

export const RECORDING_STARTS = 'Recording starts…';
export const RECORDING_FAILED = 'The recording did not start. Try again.';

// state: 'starting' | 'active' | null (a server from before the states: none, read as active).
export const recordingLabel = (state, active) => (state === 'starting' ? RECORDING_STARTS : active);
