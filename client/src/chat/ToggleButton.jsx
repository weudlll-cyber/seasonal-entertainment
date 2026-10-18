// ============================================================
// File:        ToggleButton.jsx
// Path:        client/src/chat/ToggleButton.jsx
// Project:     Seasonal Entertainment
// Description: The chat's small on/off buttons (the favourite star, the room bell): a 44px
//              round button with aria-pressed and a fixed label (the state is in aria-pressed,
//              not in a changing name), showing one glyph for on and one for off.
// ============================================================

// label: e.g. "Favourite: General"; glyphs: [on, off]; onToggle(next).
export default function ToggleButton({ on, label, glyphs, kind, onToggle }) {
  return (
    <button
      type="button"
      className={`chat-toggle chat-toggle--${kind}${on ? ' chat-toggle--on' : ''}`}
      aria-pressed={on}
      aria-label={label}
      onClick={() => onToggle(!on)}
    >
      <span aria-hidden="true">{on ? glyphs[0] : glyphs[1]}</span>
    </button>
  );
}
