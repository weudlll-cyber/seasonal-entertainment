// ============================================================
// File:        RoomTabs.jsx
// Path:        client/src/chat/RoomTabs.jsx
// Project:     Seasonal Entertainment
// Description: The full chat's room list (ChatPanel with showRoomTabs): a member's favourite
//              rooms first under "Favourites", then the other rooms; each room with its star
//              (RoomStar, members only) and its unread count. Guests see one plain list.
// ============================================================

import { groupRooms, useFavourites } from './favourites.js';
import RoomStar from './RoomStar.jsx';
import { useUnread } from './unread.js';
import UnreadCount from './UnreadCount.jsx';

function RoomGroup({ title, rooms, current, onPick }) {
  const unread = useUnread();
  return (
    <>
      {title && <h2 className="chat-rooms__heading">{title}</h2>}
      <ul className="chat-rooms">
        {rooms.map((r) => (
          <li key={r.slug} className="chat-rooms__item">
            <button
              type="button"
              className={`chat-room${r.slug === current ? ' chat-room--current' : ''}`}
              aria-current={r.slug === current ? 'page' : undefined}
              onClick={() => onPick(r.slug)}
            >
              {r.name}
            </button>
            <UnreadCount
              count={unread.room(r.slug)}
              kind="room"
              label={`${unread.room(r.slug)} unread in ${r.name}`}
            />
            <RoomStar room={r} />
          </li>
        ))}
      </ul>
    </>
  );
}

// rooms: [{ slug, name }] the reader may read; current: the shown slug; onPick(slug).
export default function RoomTabs({ rooms, current, onPick }) {
  const { rooms: favouriteSlugs } = useFavourites();
  const { favourites, others } = groupRooms(rooms, favouriteSlugs);
  return (
    <nav aria-label="Rooms" className="chat-rooms-nav">
      {favourites.length > 0 && (
        <RoomGroup title="Favourites" rooms={favourites} current={current} onPick={onPick} />
      )}
      <RoomGroup
        title={favourites.length > 0 ? 'Rooms' : null}
        rooms={others}
        current={current}
        onPick={onPick}
      />
    </nav>
  );
}
