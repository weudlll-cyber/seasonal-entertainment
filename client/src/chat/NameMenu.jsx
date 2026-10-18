// ============================================================
// File:        NameMenu.jsx
// Path:        client/src/chat/NameMenu.jsx
// Project:     Seasonal Entertainment
// Description: A message author's name. For a signed-in member looking at another member's
//              message it is a button opening a small menu (MenuButton: keyboard-operable):
//              "Send private message" (opens the direct conversation, directView.js) and "Add
//              to favourites" or "Remove from favourites". Guests' names, one's own name and
//              everything a guest sees stay plain text.
// ============================================================

import { useSession } from '../session/SessionContext.jsx';
import { requestDirect } from './directView.js';
import { useFavourites } from './favourites.js';
import MenuButton from './MenuButton.jsx';

export default function NameMenu({ name, authorId }) {
  const { user } = useSession();
  const favourites = useFavourites();
  if (!favourites.member || !authorId || authorId === user?.id) return <strong>{name}</strong>;
  const favourite = favourites.isFavouriteUser(authorId);
  const items = [
    { label: 'Send private message', run: () => requestDirect({ id: authorId, username: name }) },
    {
      label: favourite ? 'Remove from favourites' : 'Add to favourites',
      run: () => favourites.setUser(authorId, !favourite),
    },
  ];
  return (
    <MenuButton items={items} label={name} className="chat-name">
      {name}
    </MenuButton>
  );
}
