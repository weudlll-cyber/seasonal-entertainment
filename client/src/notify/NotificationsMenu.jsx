// ============================================================
// File:        NotificationsMenu.jsx
// Path:        client/src/notify/NotificationsMenu.jsx
// Project:     Seasonal Entertainment
// Description: The chat's menu ("…" on the chat page and in the chat drawer, members only) with
//              "Turn on notifications" (turnOn.js: the browser asks only now). When the browser
//              blocks them, the account page's Notifications section explains how to allow them.
// ============================================================

import { useNavigate } from 'react-router';
import { MenuButton } from '../chat/index.js';
import { useSession } from '../session/SessionContext.jsx';
import { turnOnNotifications } from './turnOn.js';

export default function NotificationsMenu() {
  const { user, refresh } = useSession();
  const navigate = useNavigate();
  if (!user) return null;
  const turnOn = async () => {
    const answer = await turnOnNotifications(user, refresh);
    if (answer === 'denied') navigate('/account#notifications');
  };
  return (
    <MenuButton
      items={[{ label: 'Turn on notifications', run: turnOn }]}
      label="Chat"
      buttonLabel="Chat menu"
      className="icon-button"
    >
      <span aria-hidden="true">…</span>
    </MenuButton>
  );
}
