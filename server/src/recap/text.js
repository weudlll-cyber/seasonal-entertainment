// ============================================================
// File:        text.js
// Path:        server/src/recap/text.js
// Project:     Seasonal Entertainment
// Description: The weekly recap's text (docs/CHAT.md, "Weekly recap"): facts only, no advice.
//              Each season token's price change over the past 7 days (a token without data is
//              left out, and with none the whole part), the next 7 days' events and calls (the
//              "Up next" list, shared/callEntries.js), the call recordings of the past 7 days,
//              and last the not-financial-advice line (shared/disclaimer.js). Dates in the
//              site's format (shared/localWeek.js) in Vienna time, when the recap is posted.
//              Site links are written as paths ("/calls/12"): the chat shows them as links in
//              the site's own messages. A pure function of its data.
// ============================================================

import { DISCLAIMER_PATH, NOT_ADVICE } from '@seasonal-entertainment/shared/disclaimer.js';
import { formatDate, formatDateTime } from '@seasonal-entertainment/shared/localWeek.js';
import { formatChange } from '@seasonal-entertainment/shared/priceChange.js';

export const RECAP_ZONE = 'Europe/Vienna';
const capitalised = (token) => token[0].toUpperCase() + token.slice(1);

// One event of the list: a bot event (perhaps with its call on this site) or a call.
function eventLine(entry, now) {
  const when = entry.live ? 'Live now' : formatDateTime(entry.start, RECAP_ZONE, now);
  if (entry.call) return `- ${when}: ${entry.name}, a call on this site: /calls/${entry.id}`;
  // A canceled occurrence stays listed, marked, as in the event lists (EventItem.jsx).
  const status = entry.status === 'canceled' ? ' (canceled)' : '';
  const listen = entry.listen ? `, listen on this site: /calls/${entry.listen.id}` : '';
  return `- ${when}: ${entry.name}${status}${listen}`;
}

// data: { weekStart (ms, the week's Monday in Vienna), prices: [{ token, change }],
// upcoming: withCalls() entries, recordings: [{ callId, title, startedAt }] }; now: ms.
export function recapText({ weekStart, prices, upcoming, recordings }, now = Date.now()) {
  const lines = [`Weekly recap for the week of ${formatDate(weekStart, RECAP_ZONE, now)}`];
  if (prices.length > 0) {
    lines.push('', 'Prices over the past 7 days:');
    for (const { token, change } of prices) {
      lines.push(`- ${capitalised(token)}: ${formatChange(change)}`);
    }
  }
  lines.push('', 'The next 7 days:');
  if (upcoming.length === 0) lines.push('- Nothing planned yet.');
  for (const entry of upcoming) lines.push(eventLine(entry, now));
  if (recordings.length > 0) {
    lines.push('', 'New call recordings (all of them: /calls/recordings):');
    for (const r of recordings) {
      lines.push(
        `- ${r.title}, ${formatDateTime(r.startedAt, RECAP_ZONE, now)}: /calls/${r.callId}`
      );
    }
  } else {
    lines.push('', 'No new call recordings this week.');
  }
  lines.push('', `${NOT_ADVICE} Disclaimer: ${DISCLAIMER_PATH}`);
  return lines.join('\n');
}
