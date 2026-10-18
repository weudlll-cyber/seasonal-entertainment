// ============================================================
// File:        RoomStar.jsx
// Path:        client/src/chat/RoomStar.jsx
// Project:     Seasonal Entertainment
// Description: The star beside a room: adds it to the member's favourites or removes it.
//              Shown to members only (guests have no favourites). Part of the module's public
//              API, so a host's own room picker (the site's chat drawer) shows the same star.
// ============================================================

import { useFavourites } from './favourites.js';
import ToggleButton from './ToggleButton.jsx';

export default function RoomStar({ room }) {
  const favourites = useFavourites();
  if (!favourites.member) return null;
  return (
    <ToggleButton
      kind="star"
      on={favourites.rooms.includes(room.slug)}
      label={`Favourite: ${room.name}`}
      glyphs={['★', '☆']}
      onToggle={(on) => favourites.setRoom(room.slug, on).catch(() => {})}
    />
  );
}
