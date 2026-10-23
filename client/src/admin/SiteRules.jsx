// ============================================================
// File:        SiteRules.jsx
// Path:        client/src/admin/SiteRules.jsx
// Project:     Seasonal Entertainment
// Description: One approved site's own rules on Admin → Embedding (docs/EMBED.md): for each
//              rule (guests reading, guests writing, members' uploads) "Inherit" (the "Other
//              sites" setting,
//              shown as on or off), "On" or "Off". A change is sent at once (audited).
// ============================================================

import { useId } from 'react';

export const RULE_LABELS = {
  guestsRead: 'Guests can read',
  guestsWrite: 'Guests can write',
  uploads: 'Uploads',
};

// rules: { rule: 'inherit' | 'on' | 'off' }; globals: { rule: true | false };
// onChange(rule, value).
export default function SiteRules({ origin, rules, globals, onChange }) {
  const id = useId();
  return (
    <div className="site-rules" role="group" aria-label={`Rules for ${origin}`}>
      {Object.entries(RULE_LABELS).map(([rule, label]) => (
        <div key={rule} className="form-field">
          <label htmlFor={`${id}-${rule}`} className="form-field__label">
            {label}
          </label>
          <select
            id={`${id}-${rule}`}
            value={rules[rule]}
            onChange={(e) => onChange(rule, e.target.value)}
          >
            <option value="inherit">Inherit ({globals[rule] ? 'on' : 'off'})</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </div>
      ))}
    </div>
  );
}
