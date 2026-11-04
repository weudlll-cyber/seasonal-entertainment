// ============================================================
// File:        DiscordSignupHint.jsx
// Path:        client/src/discord/DiscordSignupHint.jsx
// Project:     Seasonal Entertainment
// Description: The hint at the top of the password sign-up page (RegisterPage.jsx): someone with
//              a Discord account is better served by "Sign up with Discord", because only then do
//              their Seasonal Tokens roles show here (docs/AUTH.md, "Discord"). The page shows it
//              only while Discord login is set up, as the login page does with its button.
// ============================================================

import DiscordButton from './DiscordButton.jsx';
import './Discord.css';

export default function DiscordSignupHint({ next }) {
  return (
    <div className="discord-hint">
      <p>
        <strong>Have a Discord account?</strong> Sign up with Discord instead — your Seasonal Tokens
        roles then show on this site.
      </p>
      <DiscordButton intent="login" next={next}>
        Sign up with Discord
      </DiscordButton>
    </div>
  );
}
