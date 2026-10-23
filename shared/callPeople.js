// ============================================================
// File:        callPeople.js
// Path:        shared/callPeople.js
// Project:     Seasonal Entertainment
// Description: How a call names a member who hides their online status while listening
//              (docs/CALLS.md, decided 2026-10-18): the server gives that name to the call
//              service (server/src/calls/people.js), and the call page recognises it to count
//              such listeners last and unnamed (client/src/calls/stageModel.js).
// ============================================================

export const HIDDEN_LISTENER = 'A listener';
