// ============================================================
// File:        eventLink.js
// Path:        server/src/calls/eventLink.js
// Project:     Seasonal Entertainment
// Description: A call's link to one of the event bot's occurrences (docs/CALLS.md, "Linked to
//              a bot event"), kept on the site's side only: the occurrence's id and its start
//              when linked. The bot's file is only read (bots/botDb.js, bots/events.js): the
//              occurrences of the next 30 days for the organisers' picker, and the linked
//              occurrence as it is now. An occurrence that vanished or moved simply has no
//              link any more; an unreadable bot file is logged and treated as no link.
// ============================================================

import { readBotDb } from '../bots/botDb.js';
import { botOccurrences } from '../bots/events.js';

const PICK_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;

// The bot's occurrences in [from, to), or [] when the bot is not set up or cannot be read.
function occurrencesBetween(config, from, to) {
  const file = config.bots.eventDb;
  if (!file) return [];
  try {
    return readBotDb(file, (db) => botOccurrences(db, from, to));
  } catch (err) {
    console.error(`[calls] cannot read the event bot: ${err.message}`);
    return [];
  }
}

// The scheduled occurrences of the next 30 days, for the picker: [{ id, name, start }].
export function upcomingOccurrences(config, now = Date.now()) {
  return occurrencesBetween(config, now, now + PICK_DAYS * DAY_MS)
    .filter((o) => o.status === 'scheduled')
    .map(({ id, name, start }) => ({ id, name, start }));
}

// The linked occurrence as the bot has it now ({ id, name, start }), or null: not linked, or
// the occurrence is gone or no longer at the stored start.
export function linkedOccurrence(config, call) {
  if (call.botOccurrenceId === null || call.botOccurrenceId === undefined) return null;
  const start = call.botOccurrenceStart;
  const found = occurrencesBetween(config, start, start + 1).find(
    (o) => o.id === call.botOccurrenceId
  );
  return found ? { id: found.id, name: found.name, start: found.start } : null;
}

// The occurrence an organiser picked, from the picker's own list; undefined when it is not
// there (not scheduled, past, beyond 30 days, or unknown); null when none was picked.
export function pickedOccurrence(config, id) {
  if (id === undefined || id === null) return null;
  return upcomingOccurrences(config).find((o) => o.id === id);
}

// The body's botOccurrenceId: undefined or null (no link), else a positive whole number.
export const occurrenceIdField = (v) =>
  v === undefined || v === null || (Number.isSafeInteger(v) && v > 0)
    ? null
    : 'The event must be one of the event bot’s occurrences.';
