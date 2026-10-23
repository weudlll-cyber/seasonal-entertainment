// ============================================================
// File:        recap.js
// Path:        server/src/settings/groups/recap.js
// Project:     Seasonal Entertainment
// Description: The "Weekly recap" group of site settings (definitions.js): whether the site
//              posts it, on which weekday, at which hour (Europe/Vienna, as the recap's text)
//              and in which room. The room is a choice from the public rooms as they are now.
// ============================================================

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const RECAP_DAYS = DAYS.map((label) => ({ value: label.toLowerCase(), label }));
const HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

// Rooms everyone reads, listed and open: a recap must reach every visitor. Read straight from
// the chat's table (its definitions are the one part of the chat area others may use).
const publicRooms = (db) =>
  db
    .prepare(
      `SELECT slug AS value, name AS label FROM chat_rooms
       WHERE read_access = 'everyone' AND listed = 1 AND closed = 0 ORDER BY position, id`
    )
    .all();

export const RECAP_SETTINGS = {
  'recap.enabled': {
    type: 'boolean',
    label: 'Post the weekly recap',
    help: "The site's own message with the week's prices, events, calls and recordings.",
    default: true,
  },
  'recap.weekday': {
    type: 'choice',
    label: 'Weekday',
    help: 'The day it is posted; changing it never posts twice in one week.',
    choices: RECAP_DAYS,
    default: 'monday',
  },
  'recap.time': {
    type: 'choice',
    label: 'Time',
    help: 'The hour it is posted, Vienna time.',
    choices: HOURS.map((hour) => ({ value: hour, label: hour })),
    default: '09:00',
  },
  'recap.room': {
    type: 'choice',
    label: 'Room',
    help: 'Where it is posted: one of the rooms everyone reads.',
    choices: publicRooms,
    default: 'announcements',
  },
};
