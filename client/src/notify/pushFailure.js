// ============================================================
// File:        pushFailure.js
// Path:        client/src/notify/pushFailure.js
// Project:     Seasonal Entertainment
// Description: The plain words for a "When a call starts" switch that could not be turned on
//              (docs/CALLS.md, "Push when a call starts"; decided 2026-11-12: never a silent
//              failure): which step failed and what the member can do. Used by the background
//              turn-on (pushPending.js), shown under the switch (PushSwitch.jsx).
// ============================================================

import { ApiError } from '../api/http.js';
import { PushFailure } from './push.js';

const SITE_SETTINGS = 'the site settings (the icon left of the address)';
const FAILURES = {
  blocked: `Not turned on: notifications are blocked for this site in your browser. Allow them in ${SITE_SETTINGS}, reload the page and try again.`,
  not_asked: `Not turned on: the browser did not allow notifications (the question was closed or not shown). Allow them in ${SITE_SETTINGS} and try again.`,
  timeout:
    "Not turned on: your browser's push service did not answer in time. Please try again later.",
};

// The browser's step, the server's refusal, or anything else.
export function pushFailureText(err) {
  if (err instanceof PushFailure && FAILURES[err.kind]) return FAILURES[err.kind];
  if (err instanceof PushFailure) {
    const detail = err.cause?.message ? ` (${err.cause.message})` : '';
    return `Not turned on: your browser could not set up push${detail}. Please try again later.`;
  }
  if (err instanceof ApiError) return `Not turned on: the site refused it. ${err.message}`;
  return `Not turned on: ${err?.message || 'something went wrong'}. Please try again.`;
}
