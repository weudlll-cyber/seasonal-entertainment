// ============================================================
// File:        gameBand.test.js
// Path:        client/src/games/gameBand.test.js
// Project:     Seasonal Entertainment
// Description: Guards the game card band colours at every position of the rotation: the logo
//              always on the neutral band, a season image never on its own season.
// ============================================================

import { describe, expect, it } from 'vitest';
import { GAME_IMAGES } from '@seasonal-entertainment/shared/gameRules.js';
import { bandColour } from './gameBand.js';

const ROTATION = ['winter', 'spring', 'summer', 'autumn'];
// Two full turns, so the wrap from autumn back to winter is covered too.
const POSITIONS = [0, 1, 2, 3, 4, 5, 6, 7];

describe('game card band', () => {
  it('puts the Seasonal Tokens logo on the neutral band at every position', () => {
    for (const position of POSITIONS) {
      expect(bandColour(position, 'seasonal-tokens')).toBe('neutral');
    }
  });

  it('never puts a season image on its own season', () => {
    for (const image of GAME_IMAGES.filter((i) => i !== 'seasonal-tokens')) {
      for (const position of POSITIONS) {
        const turn = ROTATION[position % 4];
        const expected = turn === image ? ROTATION[(position + 1) % 4] : turn;
        expect(bandColour(position, image), `${image} at ${position}`).toBe(expected);
        expect(bandColour(position, image)).not.toBe(image);
      }
    }
  });

  it('keeps the rotation where the image allows it', () => {
    expect(POSITIONS.map((p) => bandColour(p, 'summer'))).toEqual([
      'winter',
      'spring',
      'autumn',
      'autumn',
      'winter',
      'spring',
      'autumn',
      'autumn',
    ]);
    expect(bandColour(3, 'autumn')).toBe('winter');
  });
});
