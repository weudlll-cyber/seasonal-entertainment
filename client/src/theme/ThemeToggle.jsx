// ============================================================
// File:        ThemeToggle.jsx
// Path:        client/src/theme/ThemeToggle.jsx
// Project:     Seasonal Entertainment
// Description: The light/dark switch: shows the theme it switches to, and its label says so.
//              The choice is stored and then wins over the system setting.
// ============================================================

import Icon from '../app/icons.jsx';
import { useTheme } from './ThemeContext.jsx';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={toggle}
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} />
    </button>
  );
}
