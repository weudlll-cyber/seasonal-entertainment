// ============================================================
// File:        gameBand.js
// Path:        client/src/games/gameBand.js
// Project:     Seasonal Entertainment
// Description: The colour of a game card's image band (GamesPage.css, game-card__band--*).
//              Bands take the season colours in turn by the card's position, except that the
//              Seasonal Tokens logo gets a neutral band (it holds all four colours) and a season
//              image never sits on its own colour, which would hide it.
// ============================================================

// The band rotation, starting with the first card.
const BAND_ORDER = ['winter', 'spring', 'summer', 'autumn'];

export function bandColour(position, image) {
  if (image === 'seasonal-tokens') return 'neutral';
  const season = BAND_ORDER[position % BAND_ORDER.length];
  // The next season in the rotation, so neighbouring cards still differ as much as they can.
  if (season === image) return BAND_ORDER[(position + 1) % BAND_ORDER.length];
  return season;
}
