// ============================================================
// File:        chapterRules.test.js
// Path:        shared/chapterRules.test.js
// Project:     Seasonal Entertainment
// Description: Guards the recording time format both ways and the chapter rules: m:ss and
//              h:mm:ss only, within the recording when its length is known, a title of 1 to 80
//              characters.
// ============================================================

import { describe, expect, it } from 'vitest';
import { chapterError, formatDuration, parseDuration } from './chapterRules.js';

describe('the time format', () => {
  it('writes and reads m:ss and h:mm:ss', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(parseDuration('1:15')).toBe(75);
    expect(parseDuration(' 1:02:05 ')).toBe(3725);
    expect(parseDuration('75:00')).toBe(4500);
    for (const bad of ['', '1', '1:5', '1:75', '1:60:00', 'a:bc', '-1:00', '1:02:05:00']) {
      expect(parseDuration(bad), bad).toBeNull();
    }
  });
});

describe('a chapter', () => {
  it('needs a time within the recording and a short title', () => {
    expect(chapterError({ at: '12:30', title: 'Questions' }, 1800)).toBeNull();
    expect(chapterError({ at: '12:30', title: 'Questions' }, null)).toBeNull();
    expect(chapterError({ at: '12', title: 'Questions' }, 1800)).toMatch(/m:ss or h:mm:ss/);
    expect(chapterError({ at: '40:00', title: 'Late' }, 1800)).toMatch(/after the end/);
    expect(chapterError({ at: '1:00', title: '   ' }, 1800)).toMatch(/title/);
    expect(chapterError({ at: '1:00', title: 'x'.repeat(81) }, 1800)).toMatch(/80 characters/);
    expect(chapterError({ at: '1:00', title: 'x'.repeat(80) }, 1800)).toBeNull();
  });
});
