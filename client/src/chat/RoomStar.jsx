// ============================================================
// File:        RoomStar.jsx
// Path:        client/src/chat/RoomStar.jsx
// Project:     Seasonal Entertainment
// Description: The star beside a room: adds it to the member's favourites or removes it.
//              Shown to members only (guests have no favourites). Part of the module's public
//              API, so a host's own room picker (the site's chat drawer) shows the same star.
// ============================================================

import { useFavourites } from './favourites.js';

export default function RoomStar({ room }) {
  const favourites = useFavourites();
  if (!favourites.member) return null;
  const on = favourites.rooms.includes(room.slug);
  return (
    <button
      type="button"
      className={`chat-star${on ? ' chat-star--on' : ''}`}
      aria-pressed={on}
      aria-label={`Favourite: ${room.name}`}
      onClick={() => favourites.setRoom(room.slug, !on).catch(() => {})}
    >
      <span aria-hidden="true">{on ? '★' : '☆'}</span>
    </button>
  );
}
