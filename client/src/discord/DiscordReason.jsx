// ============================================================
// File:        DiscordReason.jsx
// Path:        client/src/discord/DiscordReason.jsx
// Project:     Seasonal Entertainment
// Description: The message for the ?discord=<reason> a page came back with from the Discord
//              login (discordLinks.js), as the forms show their messages; nothing for none.
// ============================================================

import { useSearchParams } from 'react-router';
import { FormMessage } from '../components/FormField.jsx';
import { discordReason } from './discordLinks.js';

export default function DiscordReason() {
  const [params] = useSearchParams();
  const found = discordReason(params.get('discord'));
  if (!found) return null;
  const [kind, text] = found;
  return kind === 'ok' ? <FormMessage notice={text} /> : <FormMessage error={text} />;
}
