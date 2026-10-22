// ============================================================
// File:        icons.jsx
// Path:        client/src/app/icons.jsx
// Project:     Seasonal Entertainment
// Description: The shell's stroke icons (24 px grid, drawn in currentColor so they follow the
//              theme). Decorative: the control around each icon carries the text or label.
//              Also the chat's toggles (star, bell, bell-off: ToggleButton) and the call
//              controls (microphone, camera, screen, hand, sound, leave, record), so every icon on the
//              site shares one stroke width.
// ============================================================

const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5V14h4v5.5',
  games:
    'M7 8h10a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.3 2.1L14 15h-4l-.7.6A3.5 3.5 0 0 1 3 13.5V12a4 4 0 0 1 4-4ZM8 10.5v3M6.5 12h3M15.5 11.5h.01M17.5 13.5h.01',
  events: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4',
  chat: 'M4.5 5.5h15v10h-8l-4.5 4v-4h-2.5z',
  tokens:
    'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7.5v9M9 10l3-2.5 3 2.5M9 14l3 2.5 3-2.5',
  admin: 'M12 3.5 19 6v5.5c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6Z M9 12l2 2 4-4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M7 10l5 5 5-5',
  star: 'M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8Z',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15ZM10 20.5h4',
  bellOff: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15ZM10 20.5h4M4 4l16 16',
  mic: 'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3ZM6 11a6 6 0 0 0 12 0M12 17v3.5M8.5 20.5h7',
  micOff:
    'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3ZM6 11a6 6 0 0 0 12 0M12 17v3.5M8.5 20.5h7M4 4l16 16',
  camera: 'M3.5 7.5h11v9h-11zM14.5 10.5l6-3v9l-6-3',
  cameraOff: 'M3.5 7.5h11v9h-11zM14.5 10.5l6-3v9l-6-3M4 4l16 16',
  screen: 'M3.5 5h17v11h-17zM8.5 20h7M12 16v4',
  screenOff: 'M3.5 5h17v11h-17zM8.5 20h7M12 16v4M4 4l16 16',
  hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L4 14.5a1.5 1.5 0 0 1 2.5-1.7L8 15',
  volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  leave: 'M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9',
  person: 'M12 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM5 20a7 7 0 0 1 14 0',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  record: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  phoneOff: 'M5 15.5c4-3.3 10-3.3 14 0l-1.8 2.2-3-1.3v-2.2c-1.4-.4-2.9-.4-4.4 0v2.2l-3 1.3Z',
  smile: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  paperclip:
    'M16.5 7.5 9 15a2 2 0 0 0 2.8 2.8l7.4-7.4a4 4 0 0 0-5.6-5.6L6.2 12.2a6 6 0 0 0 8.5 8.5l5.8-5.8',
  send: 'M4 12 20 4l-6 16-3-7ZM11 13l9-9',
};

// filled: fills the shape too (a favourite's star); data-icon names it for tests and styles.
export default function Icon({ name, size = 22, filled = false }) {
  return (
    <svg
      className="icon"
      data-icon={filled ? `${name}-filled` : name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
