// ============================================================
// File:        FullscreenButton.jsx
// Path:        client/src/calls/FullscreenButton.jsx
// Project:     Seasonal Entertainment
// Description: Puts the stage (a shared screen or the spotlight) into the browser's full
//              screen and back; Esc leaves it too (the browser's own). Not shown where the
//              Fullscreen API is unavailable (document.fullscreenEnabled false or missing).
// ============================================================

import { useEffect, useState } from 'react';
import Icon from '../app/icons.jsx';

// target: a ref to the element to show full screen.
export default function FullscreenButton({ target }) {
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const changed = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  if (!document.fullscreenEnabled) return null;
  const label = full ? 'Leave full screen' : 'Full screen';
  return (
    <button
      type="button"
      className="stage__fullscreen"
      aria-label={label}
      data-tooltip={label}
      onClick={() => (full ? document.exitFullscreen() : target.current?.requestFullscreen())}
    >
      <Icon name={full ? 'shrink' : 'expand'} size={20} />
    </button>
  );
}
