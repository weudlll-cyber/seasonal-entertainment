// ============================================================
// File:        NotAdvice.jsx
// Path:        client/src/components/NotAdvice.jsx
// Project:     Seasonal Entertainment
// Description: The one-line notice "Information only — not financial advice." with a link to
//              the Disclaimer info page (wording and address: shared/disclaimer.js). Shown on
//              the prices page, in the home fair-price box and on the Start here page.
// ============================================================

import { Link } from 'react-router';
import { DISCLAIMER_PATH, NOT_ADVICE } from '@seasonal-entertainment/shared/disclaimer.js';

// className: extra classes from the place it sits in (e.g. the home box's layering).
export default function NotAdvice({ className }) {
  return (
    <p className={className ? `not-advice ${className}` : 'not-advice'}>
      {NOT_ADVICE} <Link to={DISCLAIMER_PATH}>Disclaimer</Link>
    </p>
  );
}
