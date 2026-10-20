// ============================================================
// File:        PageHeader.jsx
// Path:        client/src/brand/PageHeader.jsx
// Project:     Seasonal Entertainment
// Description: A section page's header in the SE style (docs/DESIGN.md, "Sub pages"): the
//              section's quarter of the emblem beside the title and a one-line lead, and the same
//              quarter large and faint at the bottom right of the window (decoration only).
// ============================================================

import { QUARTERS } from './brand.js';
import './PageHeader.css';

// quarter: a key of QUARTERS; className: extra classes for the title (e.g. a page's own).
export default function PageHeader({ quarter, title, lead, className }) {
  return (
    <>
      <img className="page-wash" src={QUARTERS[quarter]} alt="" aria-hidden="true" />
      <div className="page-header">
        <img className="page-header__mark" src={QUARTERS[quarter]} alt="" width="64" height="56" />
        <div>
          <h1 className={className}>{title}</h1>
          {lead && <p className="page-header__lead">{lead}</p>}
        </div>
      </div>
    </>
  );
}
