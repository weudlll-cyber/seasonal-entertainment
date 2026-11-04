// ============================================================
// File:        DiscordButton.jsx
// Path:        client/src/discord/DiscordButton.jsx
// Project:     Seasonal Entertainment
// Description: "Log in with Discord" / "Link Discord" / "Confirm with Discord": a plain link to
//              the server's start address (discordLinks.js), styled as the site's button. A
//              link, not a script: the whole page goes to Discord and comes back.
// ============================================================

import { discordStartUrl } from './discordLinks.js';
import './Discord.css';

export default function DiscordButton({ intent = 'login', next, secondary = false, children }) {
  return (
    <a
      className={`button discord-button${secondary ? ' button--secondary' : ''}`}
      href={discordStartUrl(intent, next)}
    >
      {children}
    </a>
  );
}
