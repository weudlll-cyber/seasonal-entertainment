// ============================================================
// File:        SiteBanner.jsx
// Path:        client/src/app/SiteBanner.jsx
// Project:     Seasonal Entertainment
// Description: The site banner (docs/SETTINGS.md, "Site banner"): while an admin has it on,
//              one line at the top of every page for everyone, as plain text, with an optional
//              link to a page of this site, in the info or warning style. A viewer can dismiss
//              it; this browser remembers the dismissed text, so a changed text shows again.
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router';
import { useSiteSettings } from '../session/SessionContext.jsx';
import { readStored, writeStored } from './storage.js';
import './SiteBanner.css';

const DISMISSED = 'se.siteBanner.dismissed';

export default function SiteBanner() {
  const settings = useSiteSettings();
  const [dismissed, setDismissed] = useState(() => readStored(DISMISSED));
  const text = settings['banner.text'];
  if (!settings['banner.enabled'] || !text || dismissed === text) return null;

  const warning = settings['banner.style'] === 'warning';
  const link = settings['banner.link'];
  const dismiss = () => {
    writeStored(DISMISSED, text);
    setDismissed(text);
  };
  return (
    // A warning is announced at once; news waits for the reader.
    <p
      className={`banner site-banner site-banner--${warning ? 'warning' : 'info'}`}
      role={warning ? 'alert' : 'status'}
    >
      <span>{text}</span>
      {link && (
        <Link className="button button--secondary" to={link}>
          Read more
        </Link>
      )}
      <button type="button" className="button button--secondary" onClick={dismiss}>
        Dismiss
      </button>
    </p>
  );
}
