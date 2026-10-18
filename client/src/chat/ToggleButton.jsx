// ============================================================
// File:        ToggleButton.jsx
// Path:        client/src/chat/ToggleButton.jsx
// Project:     Seasonal Entertainment
// Description: The chat's small on/off buttons (the favourite star, the room bell): a 44px
//              hit area drawn as a compact icon button, with aria-pressed and a fixed label
//              (the state is in aria-pressed, not in a changing name), showing one stroke icon
//              (app/icons.jsx) for on and one for off.
// ============================================================

// label: e.g. "Favourite: General"; icons: [on, off] (Icon elements); onToggle(next).
export default function ToggleButton({ on, label, icons, kind, onToggle }) {
  return (
    <button
      type="button"
      className={`chat-toggle chat-toggle--${kind}${on ? ' chat-toggle--on' : ''}`}
      aria-pressed={on}
      aria-label={label}
      onClick={() => onToggle(!on)}
    >
      {on ? icons[0] : icons[1]}
    </button>
  );
}
