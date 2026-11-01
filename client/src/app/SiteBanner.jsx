// ============================================================
// File:        SiteBanner.jsx
// Path:        client/src/app/SiteBanner.jsx
// Project:     Seasonal Entertainment
// Description: The site banner (docs/SETTINGS.md, "Site banner"): while staff have it on,
//              one line at the top of every page for everyone, as plain text, with an optional
//              link to a page of this site, in the info or warning style. A viewer can dismiss
//              it; this browser remembers the dismissed text, so a changed text shows again.
//              BannerLine draws the line itself, for the shell and for the preview on the
//              organisers' Site banner page (pages/BannerPage.jsx).
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router';
import { useSiteSettings } from '../session/SessionContext.jsx';
import { readStored, writeStored } from './storage.js';
import './SiteBanner.css';

const DISMISSED = 'se.siteBanner.dismissed';

// announce: false for a preview, which must not be read out on every keystroke.
export function BannerLine({ text, link, style, announce = true, children }) {
  const warning = style === 'warning';
  return (
    // A warning is announced at once; news waits for the reader.
    <p
      className={`banner site-banner site-banner--${warning ? 'warning' : 'info'}`}
      role={announce ? (warning ? 'alert' : 'status') : undefined}
    >
      <span>{text}</span>
      {link && (
        <Link className="button button--secondary" to={link}>
          Read more
        </Link>
      )}
      {children}
    </p>
  );
}

export default function SiteBanner() {
  const settings = useSiteSettings();
  const [dismissed, setDismissed] = useState(() => readStored(DISMISSED));
  const text = settings['banner.text'];
  if (!settings['banner.enabled'] || !text || dismissed === text) return null;

  const dismiss = () => {
    writeStored(DISMISSED, text);
    setDismissed(text);
  };
  return (
    <BannerLine text={text} link={settings['banner.link']} style={settings['banner.style']}>
      <button type="button" className="button button--secondary" onClick={dismiss}>
        Dismiss
      </button>
    </BannerLine>
  );
}
