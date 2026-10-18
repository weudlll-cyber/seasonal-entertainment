// ============================================================
// File:        LiveBadge.jsx
// Path:        client/src/calls/LiveBadge.jsx
// Project:     Seasonal Entertainment
// Description: The red LIVE badge: on a live call's card and on the sidebar's Calls item.
//              Decorative: the surrounding link or heading says "live" in words where needed.
// ============================================================

import './LiveBadge.css';

export default function LiveBadge() {
  return (
    <span className="live-badge" aria-hidden="true">
      LIVE
    </span>
  );
}
