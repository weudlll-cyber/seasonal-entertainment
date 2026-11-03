// ============================================================
// File:        IconButton.jsx
// Path:        client/src/app/IconButton.jsx
// Project:     Seasonal Entertainment
// Description: A round button showing one icon and no text (closing the chat drawer, opening
//              and closing the menu, the menu's rail, the theme): its one label is both its
//              accessible name and the tooltip a mouse user sees (title), saying what a click
//              does now. The .icon-button look is in styles/forms.css.
// ============================================================

import Icon from './icons.jsx';

// label: what a click does ("Close chat"); icon: an app/icons.jsx name; className: extra
// classes; the rest (ref, onClick, aria-expanded, …) goes to the button.
export default function IconButton({ label, icon, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`icon-button${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
