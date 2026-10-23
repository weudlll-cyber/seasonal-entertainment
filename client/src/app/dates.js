// ============================================================
// File:        dates.js
// Path:        client/src/app/dates.js
// Project:     Seasonal Entertainment
// Description: Dates in the browser (docs/DESIGN.md, "Dates"): the viewer's time zone (from the
//              device), and formatWhen, the one way a page writes a date and time — the shared
//              formatDateTime of shared/localWeek.js ("Thursday 22 October, 20:30 CEST") in that
//              zone; formatDate the same date without the time. Never the browser's own language.
// ============================================================

import {
  formatDate as formatDateIn,
  formatDateTime,
} from '@seasonal-entertainment/shared/localWeek.js';

export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// instant: an ISO string or milliseconds; timeZone: pinned by tests, else the device's.
export const formatWhen = (instant, timeZone = deviceZone()) => formatDateTime(instant, timeZone);

// The same, by the day only ("Saturday 5 December"), where a time would claim too much.
export const formatDate = (instant, timeZone = deviceZone()) => formatDateIn(instant, timeZone);
