// ============================================================
// File:        UserStar.jsx
// Path:        client/src/chat/UserStar.jsx
// Project:     Seasonal Entertainment
// Description: The star beside a member (Direct list, "Find a member" results): adds them to
//              the member's favourites or removes them — the same favourites as the name menu
//              ("Add to favourites"), held once per page (favourites.js). Members only.
// ============================================================

import { useFavourites } from './favourites.js';
import ToggleButton from './ToggleButton.jsx';

// member: { id, username }.
export default function UserStar({ member }) {
  const favourites = useFavourites();
  if (!favourites.member) return null;
  return (
    <ToggleButton
      kind="star"
      on={favourites.isFavouriteUser(member.id)}
      label={`Favourite: ${member.username}`}
      glyphs={['★', '☆']}
      onToggle={(on) => favourites.setUser(member.id, on).catch(() => {})}
    />
  );
}
