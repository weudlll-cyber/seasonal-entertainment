// ============================================================
// File:        seed.js
// Path:        server/src/events/seed.js
// Project:     Seasonal Entertainment
// Description: First-start events: the owner's weekly schedule (all times UTC, as given on
//              2026-10-17 and checked against "ST Schedule.pdf"), inserted active when the
//              events table is empty. Never runs again once events exist.
// ============================================================

const ST = 'Discord: Seasonal Tokens server';
const IC = 'Discord: Investors Club server';

// [weekday (1 = Monday), time UTC, title, channel, rule]
export const SEED_EVENTS = [
  [1, '18:00', 'Seasonal Mind Games', 'Telegram'],
  [1, '21:00', 'Seasonal Tokens Monday Battles', ST],
  [2, '19:00', 'Investors Club Mind Games', IC],
  [3, '18:00', 'Seasonal Mind Games', 'Telegram'],
  [3, '19:00', 'Seasonal Tokens Wednesday Battles', ST],
  [4, '18:00', 'Investors Club Mind Games', IC],
  [4, '19:00', 'Guess the Number', ST, 'monthly_first'],
  [5, '22:00', 'Seasonal Tokens Friday Battles', ST],
  [6, '16:00', 'Registration for Weekly Duel Tournament', 'Discord: Seasonal Tokens'],
  [6, '21:30', 'Seasonal Tokens Saturday Battles', ST],
  [7, '14:00', 'Seasonal Mind Games 1 of 2 (text format)', ''],
  [7, '18:00', 'Sunday Trading Contest', ST],
  [7, '20:30', 'Seasonal Mind Games 2 of 2 (audio format)', ''],
  [7, '21:00', 'S.T Badge Race', ''],
];

export function seedEvents(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM events').get().n > 0) return 0;
  const insert = db.prepare(
    'INSERT INTO events (title, rule, weekday, time_utc, channel) VALUES (?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    for (const [weekday, time, title, channel, rule = 'weekly'] of SEED_EVENTS) {
      insert.run(title, rule, weekday, time, channel);
    }
  })();
  return SEED_EVENTS.length;
}
