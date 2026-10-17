// ============================================================
// File:        NotFoundPage.jsx
// Path:        client/src/pages/NotFoundPage.jsx
// Project:     Seasonal Entertainment
// Description: Shown for every path the client does not know.
// ============================================================

import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <section className="page">
      <h1>Page not found</h1>
      <p>There is no page at this address.</p>
      <p>
        <Link to="/">Back to the home page</Link>
      </p>
    </section>
  );
}
