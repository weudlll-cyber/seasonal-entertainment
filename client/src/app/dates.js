// ============================================================
// File:        dates.js
// Path:        client/src/app/dates.js
// Project:     Seasonal Entertainment
// Description: Dates in the browser (docs/DESIGN.md, "Dates"): the viewer's time zone (from the
//              device), and formatWhen, the one way a page writes a date and time — the shared
//              formatDateTime of shared/localWeek.js ("Thursday 22 October, 20:30 CEST") in that
//              zone. Never the browser's own language.
// ============================================================

import { formatDateTime } from '@seasonal-entertainment/shared/localWeek.js';

export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// instant: an ISO string or milliseconds; timeZone: pinned by tests, else the device's.
export const formatWhen = (instant, timeZone = deviceZone()) => formatDateTime(instant, timeZone);
