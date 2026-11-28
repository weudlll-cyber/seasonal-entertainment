// ============================================================
// File:        ChannelPicker.jsx
// Path:        client/src/embed/ChannelPicker.jsx
// Project:     Seasonal Entertainment
// Description: The low embedded chat's channel picker, in the input's row instead of the tab row
//              (EmbedChatPage.jsx): one native select of the rooms the reader may read and, for
//              members, "Private messages", each with its unread count; the tabs' two badges sit
//              on its corner.
// ============================================================

import { UnreadCount, useChatRooms, useUnread } from '../chat/index.js';

// The select's value for private messages: no room slug holds an "@".
export const DIRECT = '@direct';

const counted = (name, count) => (count ? `${name} (${count})` : name);

// value: the room's slug or DIRECT; onPick(value); member: private messages are offered.
export default function ChannelPicker({ value, onPick, member }) {
  const { info } = useChatRooms();
  const unread = useUnread();
  return (
    <span className="embed-channel">
      <select aria-label="Channel" value={value ?? ''} onChange={(e) => onPick(e.target.value)}>
        {(info?.rooms ?? []).map((room) => (
          <option key={room.slug} value={room.slug}>
            {counted(room.name, unread.room(room.slug))}
          </option>
        ))}
        {member && (
          <option value={DIRECT}>{counted('Private messages', unread.directTotal)}</option>
        )}
      </select>
      <span className="embed-channel__counts">
        <UnreadCount
          count={unread.roomTotal}
          kind="room"
          label={`${unread.roomTotal} unread in rooms`}
        />
        <UnreadCount
          count={member ? unread.directTotal : 0}
          kind="direct"
          label={`${unread.directTotal} unread private messages`}
        />
      </span>
    </span>
  );
}
