// ============================================================
// File:        seasonMarks.test.js
// Path:        client/src/assets/seasons/seasonMarks.test.js
// Project:     Seasonal Entertainment
// Description: Fast check of the web-ready season marks written by
//              scripts/build-season-marks.mjs: square viewBox, one shared size, and the
//              original paths wrapped in one translate + uniform-scale group. The optical
//              centring itself is measured in the browser (client/e2e/seasonMarks.spec.js).
// ============================================================

import { describe, expect, it } from 'vitest';
// ?raw makes Vite hand over the file text, exactly as written by the script.
import spring from './spring.svg?raw';
import summer from './summer.svg?raw';
import autumn from './autumn.svg?raw';
import winter from './winter.svg?raw';

const FILES = { spring, summer, autumn, winter };
const IDS = Object.keys(FILES);

describe('web-ready season marks', () => {
  it.each(IDS)('%s has a square viewBox starting at 0 0', (id) => {
    const [, x, y, w, h] = FILES[id].match(/viewBox="([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+)"/);
    expect([x, y]).toEqual(['0', '0']);
    expect(w).toBe(h);
  });

  it('all four share one size, so their motifs have the same size', () => {
    const sizes = IDS.map((id) => FILES[id].match(/viewBox="0 0 ([\d.]+)/)[1]);
    expect(new Set(sizes).size).toBe(1);
  });

  it.each(IDS)('%s wraps its paths in one translate + uniform scale group', (id) => {
    const groups = FILES[id].match(/<g transform="[^"]*"/g);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatch(/^<g transform="translate\([\d.-]+ [\d.-]+\) scale\([\d.]+\)"$/);
  });
});
