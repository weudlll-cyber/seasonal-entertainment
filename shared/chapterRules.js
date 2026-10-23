// ============================================================
// File:        chapterRules.js
// Path:        shared/chapterRules.js
// Project:     Seasonal Entertainment
// Description: A recording's length and its chapter marks (docs/CALLS.md, "Recording"): the
//              time format both sides write and read ("1:15", "1:02:05"), and what a chapter
//              may be (a time within the recording, a title of at most 80 characters). The
//              form checks with chapterError before sending; the server applies the same.
// ============================================================

export const CHAPTER_TITLE_MAX = 80;

const pad = (n) => String(n).padStart(2, '0');

// 75 -> "1:15"; 3725 -> "1:02:05".
export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(seconds % 60)}` : `${m}:${pad(seconds % 60)}`;
}

// "1:15" -> 75, "1:02:05" -> 3725 (minutes below 60 when hours are given); null otherwise.
export function parseDuration(text) {
  const match = /^(?:(\d+):([0-5]\d)|(\d+)):([0-5]\d)$/.exec(String(text ?? '').trim());
  if (!match) return null;
  const [, hours, minutes, onlyMinutes, seconds] = match;
  return hours !== undefined
    ? Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
    : Number(onlyMinutes) * 60 + Number(seconds);
}

// input: { at (the typed time), title }; length: the recording's seconds, null when unknown.
// Returns what is wrong, or null.
export function chapterError({ at, title }, length) {
  const seconds = parseDuration(at);
  if (seconds === null) return 'Enter the time as m:ss or h:mm:ss, for example 12:30.';
  if (length !== null && seconds > length) return 'The time is after the end of the recording.';
  const text = typeof title === 'string' ? title.trim() : '';
  if (!text) return 'Give the chapter a title.';
  if (text.length > CHAPTER_TITLE_MAX) {
    return `The title is longer than ${CHAPTER_TITLE_MAX} characters.`;
  }
  return null;
}
