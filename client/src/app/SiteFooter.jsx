// ============================================================
// File:        SiteFooter.jsx
// Path:        client/src/app/SiteFooter.jsx
// Project:     Seasonal Entertainment
// Description: Site footer with the legal links (Imprint, Privacy).
// ============================================================

import { Link } from 'react-router';
import { FOOTER_NAV } from './navigation.js';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Legal">
        <ul className="site-footer__nav">
          {FOOTER_NAV.map((item) => (
            <li key={item.to}>
              <Link to={item.to}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
