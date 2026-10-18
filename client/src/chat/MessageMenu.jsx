// ============================================================
// File:        MessageMenu.jsx
// Path:        client/src/chat/MessageMenu.jsx
// Project:     Seasonal Entertainment
// Description: A message's "…" button (visible on hover and focus, always on touch screens)
//              with its actions in a keyboard-operable menu (MenuButton) — the same actions,
//              permissions and server routes as the former row of links under each message:
//              Report for everyone; for moderators Hide and Ban (both ask first), Mute 10 min /
//              1 h / 24 h, Remove file, Remove preview. Also a direct message's Report.
// ============================================================

import MenuButton from './MenuButton.jsx';

const MUTES = [10, 60, 1440];
const muteLabel = (minutes) => `Mute ${minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}`;

// The actions a viewer has on a room message, as before: onAction(action, message, minutes).
export function roomMessageActions(message, moderator, onAction) {
  const act = (action, minutes) => () => onAction(action, message, minutes);
  const items = [{ label: 'Report', run: act('report') }];
  if (!moderator || message.hiddenAt) return items;
  items.push({
    label: 'Hide',
    run: act('hide'),
    confirm: { question: 'Hide this message for everyone?', action: 'Hide' },
  });
  for (const minutes of MUTES) items.push({ label: muteLabel(minutes), run: act('mute', minutes) });
  items.push({
    label: 'Ban',
    run: act('ban'),
    confirm: { question: `Ban ${message.author} from the chat?`, action: 'Ban' },
  });
  if (message.file && !message.file.removed) {
    items.push({ label: 'Remove file', run: act('file/remove') });
  }
  if (message.preview) items.push({ label: 'Remove preview', run: act('preview/remove') });
  return items;
}

// author: whose message it is (the button's name says so).
export default function MessageMenu({ items, author }) {
  return (
    <div className="chat-message__menu">
      <MenuButton
        items={items}
        label={`Message from ${author}`}
        buttonLabel={`Actions for the message from ${author}`}
        className="chat-message__more"
      >
        <span aria-hidden="true">…</span>
      </MenuButton>
    </div>
  );
}
