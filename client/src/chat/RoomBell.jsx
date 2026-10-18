// ============================================================
// File:        RoomBell.jsx
// Path:        client/src/chat/RoomBell.jsx
// Project:     Seasonal Entertainment
// Description: The bell beside a room: mutes or unmutes it for the member. A muted room stays
//              readable; its unread count is dimmed and left out of the room total (mentions
//              still count). Members only. Part of the module's public API, like RoomStar.
// ============================================================

import Icon from '../app/icons.jsx';
import ToggleButton from './ToggleButton.jsx';
import { useUnread } from './unread.js';

export default function RoomBell({ room }) {
  const unread = useUnread();
  if (!unread.member) return null;
  return (
    <ToggleButton
      kind="bell"
      on={unread.muted(room.slug)}
      label={`Mute: ${room.name}`}
      icons={[<Icon key="on" name="bellOff" />, <Icon key="off" name="bell" />]}
      onToggle={(on) => unread.setMuted(room.slug, on).catch(() => {})}
    />
  );
}
