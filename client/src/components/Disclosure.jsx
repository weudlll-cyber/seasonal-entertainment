// ============================================================
// File:        Disclosure.jsx
// Path:        client/src/components/Disclosure.jsx
// Project:     Seasonal Entertainment
// Description: A collapsible section (the account page's sections, docs/DESIGN.md "Account
//              page"): a heading whose real button opens and closes the panel (aria-expanded,
//              aria-controls; Enter and Space as for every button), with the title and, while
//              given, one short status line under it. Controlled: the caller keeps which are
//              open (useOpenSections.js). The panel stays mounted while closed (hidden), so its
//              forms keep what was typed and load as they would open; it is a region named by
//              the title. `id` is the section's anchor (#id) and prefixes the parts' ids.
// ============================================================

import Icon from '../app/icons.jsx';
import './Disclosure.css';

export default function Disclosure({ id, title, status, open, onToggle, className, children }) {
  const panelId = `${id}-panel`;
  const titleId = `${id}-title`;
  return (
    <section id={id} className={['disclosure', className].filter(Boolean).join(' ')}>
      <h2 className="disclosure__heading">
        <button
          type="button"
          className="disclosure__button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(!open)}
        >
          <span className="disclosure__text">
            <span id={titleId} className="disclosure__title">
              {title}
            </span>
            {status && <span className="disclosure__status">{status}</span>}
          </span>
          <Icon name="chevron" size={20} />
        </button>
      </h2>
      <div
        id={panelId}
        className="disclosure__panel"
        role="region"
        aria-labelledby={titleId}
        hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}
