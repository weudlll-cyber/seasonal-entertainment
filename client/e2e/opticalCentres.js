// ============================================================
// File:        opticalCentres.js
// Path:        client/e2e/opticalCentres.js
// Project:     Seasonal Entertainment
// Description: The one definition of where each season motif's optical centre is, as
//              drawnBox() options. Used by scripts/build-season-marks.mjs (to centre the files)
//              and by seasonMarks.spec.js (to check them on the page).
// ============================================================

// Spring and summer have a part in its own colour; autumn's leaf and winter's six-fold
// snowflake (whose centroid is its hub) use the centroid of all drawn pixels.
export const SEASON_MARKS = [
  { id: 'spring', name: 'Spring', centre: 'filled star', options: { colour: '#C1CA55' } },
  { id: 'summer', name: 'Summer', centre: 'inner circle', options: { colour: '#E8956B' } },
  { id: 'autumn', name: 'Autumn', centre: 'leaf centroid', options: {} },
  { id: 'winter', name: 'Winter', centre: 'snowflake hub', options: {} },
];
