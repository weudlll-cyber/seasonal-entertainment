# CHAT.md — the chat module

The chat is one self-contained module on each side: a client component that can be placed on any
page of this site, and a server area mounted with one call. Embedding it in other applications
(the race game, other sites) is the next task; this module is built so that it can follow without
a rewrite (last section).

## Client: `<ChatPanel>`

Everything chat lives in `client/src/chat/`: data access, the live connection, message list,
composer, picker, moderation actions and styles. Pages import **only** `client/src/chat/index.js`:

```jsx
import { ChatPanel } from '../chat/index.js';

<ChatPanel room="general" variant="full" showRoomTabs />;
```

| Input                    | Type                    | Default          | Meaning                                                                  |
| ------------------------ | ----------------------- | ---------------- | ------------------------------------------------------------------------ |
| `room`                   | string (room slug)      | required         | the room shown; the panel follows when it changes                        |
| `variant`                | `'full'` \| `'compact'` | `'full'`         | a page of its own, or a box beside other content                         |
| `showRoomTabs`           | boolean                 | `false`          | let the reader switch between the rooms they may read                    |
| `unlisted`               | boolean                 | `false`          | `room` is an unlisted room (a call's chat): asked for by name            |
| `files`                  | boolean                 | `true`           | offer members "Attach file"; `false` where uploads are refused           |
| `guestPrompt`            | React node              | `null`           | shown to a guest instead of the composer (e.g. a login offer)            |
| `--chat-list-max-height` | CSS custom property     | `60vh` / `18rem` | cap of the message list; `none` lets it fill a container of fixed height |
| account                  | from `SessionProvider`  | —                | who is signed in (`client/src/session`); a guest if no                   |

`index.js` also exports **`useChatRooms()`**: the rooms the current reader may read and who they
are in the chat (`{ info: { rooms, me }, error, reload }`), for a host's own room picker (the
site's chat drawer, docs/DESIGN.md). The panel itself uses the same hook. For the same picker
it exports the member's favourites: **`useFavourites()`** (`{ member, rooms, users,
isFavouriteUser, setRoom, setUser }`; one shared copy per page, so every place agrees),
**`groupRooms(rooms, favouriteSlugs)`** (favourites first, both groups in the rooms' own order)
and **`<RoomStar room>`** (the star; renders nothing for guests). For direct messages it exports
**`<DirectPanel keyId privateKey variant>`** (the conversation list or one conversation; the host
passes the member's unlocked key and shows the unlock step while there is none) and
**`<MenuButton items label buttonLabel className>`** (the module's small keyboard menu: arrows,
Escape, Tab; an item with `confirm` asks first — the call stage uses it for its speaker menu) and
**`useNewMessageCount(room, counting)`** (messages that arrived in a room while counting — a
collapsed call chat, whose unlisted room is not in the unread counters).
**`onDirectRequest(callback)`** (a name menu asked for a conversation: the host brings its Direct
tab forward). The module encrypts and decrypts with `shared/crypto.js`, the only other outside
import it is allowed.

The module uses nothing else from the page around it. From outside its folder it imports only
React, the shared chat rules (`@seasonal-entertainment/shared/chatRules.js`), the account context
(`client/src/session/SessionContext.jsx`), the site's API client (`client/src/api/http.js`) and
the site's stroke icons (`client/src/app/icons.jsx`, a leaf file without imports; since
2026-10-18, so the stars and bells match the rest of the site);
`client/src/chat/chatModule.test.js` fails on any other import, and on any page importing a file
of the module other than `index.js`.

- **Styles** sit under one root class, `.se-chat` (`ChatPanel.css`, `ChatPanelVariants.css`,
  `ChatMessage.css`, `ChatPicker.css`), with the module's own buttons and notices. Colours and spacing come from the
  site's tokens when they exist (`--color-text`, `--space-1`, …) with built-in fallbacks, so a
  panel looks the same on any page and on a host without those tokens.
- **One connection per page** (`connection.js`): however many panels a page shows, they share one
  WebSocket; each room is subscribed once, and every pushed event names its room, so each panel
  receives only its own. The socket reconnects after a drop and closes right after the render
  in which the last panel left (a panel that comes straight back, as under React's StrictMode,
  reuses it).
- **Account changes** (login, logout, switching account) while a panel stays on the page: the
  server knows a socket's reader only from the session cookie at connect time, so the panel
  tells the connection the new account (`connectAs`), which drops the old socket and opens a
  new one that subscribes every room again; the rooms and the messages are loaded again for
  the new reader. Without this, a panel opened as a guest kept a guest's connection after
  logging in (no live events from members-only rooms).
- **Nothing is lost while a connection (re)opens** (SE-NIGHT-2 part 1): a message stored after
  the panel's load but before the server has confirmed the new socket's subscription is neither
  in the load nor pushed. So on every `subscribed` the panel fetches what it missed
  (`GET /api/chat/rooms/<room>/messages?after=<newest id it has>`, same read rule as the plain
  load), and a load or catch-up is merged by id into what was pushed meanwhile instead of
  replacing it.
- **The composer** writes one message at a time: optional text plus at most one attachment. A
  sticker or GIF from the picker is shown small above the field with an ×; Send sends both
  together (`{ body, attachment }` to `POST /api/chat/rooms/<room>/messages`). Members also
  get **Attach file** (images and PDFs): the file is uploaded first (`POST /api/chat/uploads`)
  and then sent like any attachment; uploaded files are fetched only through the access-checked
  `/api/chat/files/...` (ARCHITECTURE.md, "Chat").
- **Sending**: the text stays in the field until the server has answered (a refused message is
  not lost), then the field clears. The live connection often delivers the sender's own message
  before that answer: it is listed once, since the list keeps one entry per message id
  (`applyEvent`, `mergeMessages` in `useChatRoom.js`). For that moment the same text is both in
  the list and in the field, so a test looking for a just-sent message looks inside the message
  list (`client/src/chat/chatPanel.test.jsx`).
- **The message list** (`MessageList.jsx`, `useScrollPin.js`) opens at the newest message and
  stays pinned to it while the reader is at or near the bottom (48 px), also when an image or a
  preview card makes the newest message grow; a reader who scrolled up is not moved and gets a
  "New messages" button that scrolls down. A room switch starts at the newest message again.
  The same in both variants.
- **Layout**: a panel is a column that fills the height its container gives it; the message list
  takes the room left and the composer stays at the bottom. `full` fills its container (the
  `/chat` page's main column), with room tabs as a column on the left (a row below 600px).
  `compact` caps its list at 18rem unless the host sets `--chat-list-max-height`, and draws the
  composer as one row: a single-line field and icon buttons, their texts kept as accessible
  names (docs/DESIGN.md, "Compact chat composer").
- **No page paths or layout assumptions** inside the module: it calls the API and the WebSocket on
  the page's own origin (`/api/chat/...`, `/ws/chat`, `/media/...`) and fits the width it is given.
- **Test-only page** `/test/chat-panels` (two compact panels side by side) is routed by the Vite
  dev server only; production builds leave it out (`import.meta.env.DEV`).

## Message actions

Every message — in a room (the `/chat` page, the drawer, a call's chat) and in a private
conversation — has a **"…"** button at its top right (`MessageMenu.jsx`; shown on hover and
keyboard focus, always on touch screens). It opens a keyboard-operable menu (`MenuButton.jsx`:
Enter, Space or ArrowDown open it, arrows move, Escape closes) with the same actions, permissions
and server routes as the former row of links under each message (2026-10-18, SE-CALLS-3):
**Report** for everyone (in a private conversation: the partner's readable messages); for
moderators also **Hide** and **Ban** (both ask first in the menu), **Mute 10 min / 1 h / 24 h**,
**Remove file**, **Remove preview**.

## Unread counters

Members (never guests: no account to keep read state) see how many messages they have not read,
in two colours (decided 2026-10-18): **blue** (winter, `#04AAF7`) for room messages, **orange**
(summer, `#E06E22`), both with dark text `#12161C` (7.0:1 and 5.3:1, WCAG AA).

- **Where**: two badges side by side on the floating chat button and the sidebar's "Chat" item
  (blue: all rooms; orange: all private messages); per room in the drawer's room picker and the
  full chat's room list; per conversation in the Direct list; the "Rooms" and "Direct" tabs carry
  their totals. A badge is hidden at 0 and shows "99+" above 99. Accessible names say both numbers,
  e.g. "Chat: 2 unread room messages, 3 unread private messages".
- **Read markers** (`chat_reads`, one table and one helper for rooms and conversations,
  `server/src/chat/readMarkers.js`): a room's unread messages are those after the member's marker
  in a room they may read, not their own, not hidden; before the first marker, only messages
  written after the account was created count. A conversation's are the partner's messages after
  the marker. Markers only move forward.
- **Reading**: a room panel (drawer or `/chat`) that shows the newest message — scrolled to the
  bottom, no "New messages" waiting — moves the marker (`POST /api/chat/rooms/<slug>/read`); an
  opened conversation does the same (`POST /api/chat/direct/<id>/read`).
- **Muting a room** (members): a bell (`RoomBell`, `aria-pressed`, label "Mute: <room>"; the bell
  icon when sounding, the bell with a slash when muted) beside each room in the full chat's room
  list and beside the drawer's room picker. A muted room stays
  readable as normal; its own count is shown dimmed and left out of the blue total. Stored per
  account on the server (`chat_room_mutes`, `PUT`/`DELETE /api/chat/rooms/<slug>/mute`), so it
  holds across reloads and devices; the member's other sockets hear "muted" and recount.
- **One store** (`client/src/chat/unread.js`, `useUnread()`): all counts come from one request,
  `GET /api/chat/unread`; no badge fetches on its own. The server pushes "activity" to every
  account socket that may read a room when a message arrives or is hidden there, and "read" to all
  of a member's sockets when they read, so the counts stay live and the same in every tab.

## Favourites

Members (never guests) keep favourite **rooms** and favourite **members**, stored on the server
per account (`chat_favourite_rooms`, `chat_favourite_users`; deleted with either account).

- **Rooms**: a star beside each room in the full chat's room list and beside the drawer's room
  picker (`aria-pressed`, label "Favourite: <room>"; an outline star when off, a filled autumn
  star when on). Favourite rooms come first under a
  "Favourites" heading (in the picker: a "Favourites" group of the listbox), then the rest; the
  keyboard moves through both as one list. Rooms keep their colour mark by their place among all
  rooms. Only rooms the member may read can be favourites, and a favourite the member can no
  longer read (role or room change) is left out.
- **Members**: in every message, another member's name is a button opening a small menu ("Send
  private message", "Add to favourites" / "Remove from favourites"; Enter, Space or ArrowDown
  open it on the first item, arrows move, Escape closes and returns to the name). The same star
  as for rooms (`UserStar`; every star and bell is one `ToggleButton` with the site's stroke
  icons, `client/src/app/icons.jsx`, docs/DESIGN.md "Icons") sits beside each conversation in
  the Direct list and each "Find a member" result (there in a column beside the listbox, since a
  button inside an option could not be operated); all of them change the same favourites, and
  favourite partners stay listed first. Guests' names and one's own name stay
  plain text, and guests see no menus or stars. Messages carry the author's account id
  (`authorId`, `null` for guests) for this.
- **API** (`server/src/chat/favouriteRoutes.js`, members only): `GET /api/chat/favourites` →
  `{ rooms: [slug], users: [{ id, username, online }] }` (online: see "Online status");
  `PUT`/`DELETE /api/chat/favourites/rooms/<slug>` and `/users/<id>`. The account always comes
  from the session, so nobody can read or change another member's favourites. A guest is not an
  account and so cannot be a favourite; neither can oneself.

## Keys and the recovery code

Direct messages between members are end-to-end encrypted; every member has an **X25519 key pair**
(`crypto_box_keypair`), made **in the browser** at registration or at the first login after keys
were introduced (`client/src/keys/`, server `server/src/keys/`, `/api/keys`).

- **Stored on the server**: the public key with a key id and its creation time (`user_keys`, a
  history: a new pair gets a new id, old ones stay so old messages still name their key), and the
  private key **only sealed** (`user_secret_keys`): `crypto_secretbox_easy` with the wrapping key
  derived from the password (docs/AUTH.md, "Login key split"), fresh random nonce. The server can
  open nothing; it checks only the shapes (a sealed key is always 72 bytes).
- **Proof of the password**: every change to the keys — creating the first pair (`POST
/api/keys`), replacing it (`POST /api/keys/replace`), re-sealing it (`PUT /api/keys/sealed`),
  setting or removing the recovery seal (`PUT`/`DELETE /api/keys/recovery`, since 2026-10-18) —
  needs the current password's auth key (failed tries limited per account), so a taken-over
  session alone can neither swap the keys others encrypt to nor take away a member's way back
  in.
  `POST /api/keys/check` answers whether a password is right at all: when the sealed key does not
  open, the browser asks it first, so a typo is never mistaken for a lost key.
- **Recovery code — optional** (decided 2026-10-17). Right after a key pair is made, a dialog
  offers it: **Create recovery code** — 30 characters in 6 groups of 5 from an alphabet without
  look-alikes (150 bits), shown once with **Copy** and the required checkbox "I have saved my
  recovery code"; the private key is additionally sealed with `crypto_pwhash(code, its own
salt)` and that seal stored (`PUT /api/keys/recovery`) — the code itself never leaves the
  browser. Or **Skip**, with the warning "Without a recovery code, your private messages are lost
  if you forget your password."; nothing is stored and it is not asked again automatically. The
  account page ("Private messages") offers **Create recovery code** when there is none, **Create a
  new recovery code** (the old one stops working) and **Remove recovery code**; all of them need
  the key unlocked on that device and the current password (typed there; the offer right after a
  new key pair reuses the auth key of the flow that made it, kept in memory only until the offer
  closes).
- **Unlocked on a device**: a non-extractable Web Crypto AES-GCM key in IndexedDB wraps a local
  copy of the private key (`client/src/keys/deviceKey.js`), so the device stays unlocked across
  reloads and tabs until **logout, which deletes the copy and that key**. Nothing goes to
  `localStorage`. Without it (new device, after logout) the account page — and the Direct tab —
  shows **Unlock private messages** (the password, its keys derived with the pre-login salt).
  Rooms never need unlocking.
- **Password change**: the browser re-seals the same private key for the new password and sends
  it in the same request as the new verifier; the server stores both in one transaction.
- **When the sealed key no longer opens** (an admin reset the password; a forgotten password was
  reset): with a recovery seal, the recovery code opens it and it is sealed again for the current
  password (`PUT /api/keys/sealed`). Always offered too, and the only way without a recovery seal:
  **Start over without my old messages** — a new key pair (new key id), the recovery seal gone,
  old direct messages unreadable for this member, the recovery-code dialog offered again; the
  conversation partners see that the key changed.

## Direct messages

End-to-end encrypted messages between **members only** (decided 2026-10-17); guests can neither
open nor send them. Any member can write to any member.

- **Where**: "Send private message" in the name menu of another member's message; the chat
  drawer's **Direct** tab and the **Direct** tab of the full `/chat` page (members only). The
  conversation list shows favourite members first (with an online mark), then the most recent
  conversations, each with its **unread count** (orange; see "Unread counters"). Without an
  unlocked key on the device, the Direct tab shows "Unlock private messages" (see "Keys and the
  recovery code").
- **Encryption** (in the browser, `shared/crypto.js`): message = `crypto_box_easy(JSON { text,
mediaItemId? }, nonce, recipientPublicKey, senderPrivateKey)`, a fresh random nonce each time.
  Either side opens it with the other's public key and its own private key. The server stores
  ciphertext, nonce, sender and recipient ids, both key ids and the time (`direct_messages`) and
  pushes each new message over the existing WebSocket to both members' open sockets (no
  subscription needed). It never sees the text.
- **What a message can hold (v1, decided 2026-10-18)**: text, emoji, and stickers/GIFs from the
  site's library (the library id travels inside the ciphertext; the browser loads the public
  library file, `GET /api/chat/media`, once per page and shares it with the picker:
  `client/src/chat/mediaLibrary.js`, SE-NIGHT-2 part 5). **No file uploads and no link previews** in direct messages; links are plain
  clickable links. Both are open backlog items.
- **Rules** (`server/src/chat/directRoutes.js`): the same mute/ban and the same per-sender rate
  limit as room messages (one shared limiter); a locked account has no session. The partner must
  have a key; both key ids must be the current ones, else `409 key_changed` with the partner's
  current key, and the browser encrypts once more. A member reaches only their own conversations;
  moderators and admins have no access (see "Reporting a direct message").
- **Key changes**: when the partner's key id changes (they started over), the conversation shows
  "<name>'s security key changed" at that point; messages made for an earlier key of one's own
  say they cannot be read.
- **Older messages** (SE-NIGHT-2 part 4): a conversation opens with its newest 100 messages.
  Reaching the top, or **Load older messages** there, loads the 100 before the oldest shown
  (`GET /api/chat/direct/:id?before=<id>`, oldest first within the page, with `more` telling
  whether older ones remain and the public keys that page's messages name). They are decrypted
  in the browser like the rest, key-change notices included, and the reader stays on the
  message they were looking at (`client/src/chat/useOlderOnTop.js`). Pages are merged by id
  (`mergeMessages`, shared with the rooms), so a live reload of the newest page keeps them. Only
  the two members of a conversation can page through it, as with the newest page.
- **Retention**: direct messages follow the same `CHAT_RETENTION_DAYS` as room messages.
- **Known limit**: the server hands out the public keys. A compromised server could give a member
  a key of its own instead of the partner's and read what is then sent (an active attack). A
  safety-number check between two members, to compare keys outside the site, is an open backlog
  item.

## @mentions

Typing `@` and a member's name in a room message mentions them (decided 2026-10-18). Rooms are not
end-to-end encrypted, so the server reads the names; direct messages are left out (one-to-one
anyway).

- **Which names count**: "@" and a username-shaped name (3–24 letters, digits, `_`, `-`, `.`),
  not inside a word or an email address; a full stop right after the name ends the sentence
  (`shared/chatRules.js`, `splitMentions` / `mentionedNames`, the same rule on both sides). A
  mention counts only for an existing member who may read that room and is not the sender; it is
  stored per message and member (`chat_mentions`, `server/src/chat/mentions.js`). Unknown names do
  nothing. Guests may type "@name" too: it notifies only if it resolves as above. Sender limits and
  rate limits apply unchanged.
- **For the mentioned member**: the message is highlighted for them; their room count shows an
  "@" marker; the blue dot on the chat button and the sidebar shows an "@" while any unread mention
  exists — **also in muted rooms** (decided 2026-10-18). Reading the message (the room's marker
  passing it) clears it. `GET /api/chat/unread` counts each room's unread mentions.
- **For everyone**: a resolved `@username` is a highlighted name chip; clicking it opens the
  existing name menu. Everything stays text: nothing in a message is ever HTML.
- **Suggestions**: in a room's composer, a member typing "@" and at least 2 more characters gets a
  list of members who may read that room (the member search with a room filter, "Finding a
  member"). Arrow keys move, Enter or Tab inserts "@username ", Escape closes the list. Guests get
  no suggestions.

## Finding a member

"Find a member" at the top of the Direct tab (drawer and `/chat`), members only: a combobox with a
listbox of up to 10 members. From 2 characters (debounced), usernames containing the text,
case-insensitively, names starting with it first, then by name. Arrow keys move, Enter opens the
conversation (or starts it), Escape closes the list. Members who have not set up private messages
(no key yet) are shown greyed, "Has not set up private messages yet", and cannot be chosen.

`GET /api/chat/members?q=<text>[&room=<slug>]` (`server/src/chat/memberRoutes.js`): members only,
its own rate limit per account (`rateLimits.memberSearch`, 60 a minute). Never the searcher,
locked accounts or members banned from the chat. With a room (the @mention suggestions), only
members who may read it, judged by the same rule as their own requests; the searcher must be able
to read it too. Each result is exactly `{ id, username, canReceive, online }`: never an email or
anything else.

## Online status

A member counts as online while they have the chat open (an open chat socket). The site shows it
beside favourite members, in the Direct list and conversation, and in "Find a member" results.

- **"Show when I'm online"** (account page, "Privacy"; decided 2026-10-18): a switch, **on** by
  default for new and existing accounts (`users.show_online`, `PUT /api/auth/privacy`, the
  member's own account only). Off, the member appears offline to everyone else everywhere: every
  presence the server hands out goes through one place (`hub.onlineUserIds()`), which leaves them
  out. Their own view of others does not change.
- **Live**: a change is pushed as "presence" to every member's open sockets; open lists (the
  favourites, the Direct list) reload their online marks at once.
- There are no room online lists or presence counts; if they come, they must use the same place.

## Reporting a direct message

Moderators and admins may see direct messages **only when the affected member releases them**
(decided 2026-10-17).

- **Report** on a message of the partner opens a dialog: a reason, the messages of the
  conversation up to the reported one (it is selected; earlier ones can be added), and the
  checkbox **"Share the selected messages with the moderators"**. Only when it is ticked does the
  reporter's browser send the selected messages — as it decrypted them — as copies with the
  report. Without the tick, moderators get only the reason and the fact that a private
  conversation was reported (`direct_reports`).
- **The server checks the ids**: the reported message and every shared one must be a message the
  reporter sent or received in that conversation; anything else refuses the whole report
  (`400 not_in_conversation`), nothing stored. The author and time of each copy come from the
  server, the text from the reporter (`direct_report_copies`).
- **Moderators** (organisers and admins with 2FA) find them in Admin → Chat, "Reported private
  conversations" (`GET /api/chat/direct-reports`). Shared copies are loaded only on request and
  labelled "Shared by the reporter from a private conversation — content as provided by the
  reporter"; every such view writes an audit entry (`chat.direct_report_view`), as do the report
  (`chat.direct_report`, with the number of copies, never their text) and the review
  (`chat.direct_report_review`).
- **Deletion**: shared copies are deleted 90 days after the report was marked reviewed (decided
  2026-10-18; the retention job, `server/src/chat/retention.js`).

## Server: `mountChat()`

`server/src/chat/mount.js` mounts the whole chat area — rooms and messages, moderation, the
sticker/GIF library (`server/src/media/`), link previews (`server/src/previews/`), members' file
uploads (`server/src/uploads/`), the WebSocket hub and the retention job:

```js
const chat = mountChat({ app, api, db, config, sessionParser, previewNetwork });
// chat.sessions.ended(sessionId)                 logout: close that session's sockets
// chat.sessions.accountChanged(userId, keepSid)  role, lock, password, 2FA: close the account's sockets
// chat.sessions.presenceChanged()                 someone showed or hid their online status
// chat.rooms.createUnlisted(room)               a room of another area (a call's chat), unlisted
// chat.rooms.close(id)                           that room becomes read-only for everyone
// chat.rooms.find(id) / findBySlug(slug)          read a room
// chat.attach(httpServer)                        the WebSocket, once the server listens
// await chat.start()                             first-start rooms and media, retention job
```

**Unlisted and closed rooms** (2026-10-19, for calls, docs/CALLS.md): an unlisted room is left
out of the room lists (`GET /api/chat/rooms`, the drawer, the admin's room editor) and the
unread counters; `GET /api/chat/rooms?include=<slug>` adds it for a panel that shows it, when the
viewer may read it. A closed room keeps its messages (normal retention) but nobody may write in
it any more (`canWrite` is false, posting answers 403 `read_only`). A guest's chat identity
(`chat/guestIdentity.js`: a unique guest name kept in the session) is given on the first
message, report or call join.

`api` is the `/api` router after sessions, the current user and the 2FA gate; call `mountChat`
before the API's catch-all 404. Outside the chat area only `mount.js` (and the table definitions
the database layer registers) may be imported; `server/test/chatBoundary.test.js` enforces it.

## Embedding

The chat runs as an iframe of `/embed/chat?room=<slug>&theme=<light|dark|auto>`: the compact
panel, for members with **Rooms | Direct** tabs, the room's rules, and a small postMessage API
(ready, unread, resize; visible, theme) with strict origin checks. Details and the snippet:
docs/EMBED.md.

- **On this site's own pages** (the games under the main domain; SE-NIGHT-2 part 6): the site's
  login cookie and device unlock, exactly as on the site.
- **On other sites an admin approved** (SE-NIGHT-2 follow-up, part A; owner decision
  2026-10-19): no cookie there. A login popup on this site hands the frame an embed token
  (docs/AUTH.md, "Embed tokens") and, unlocked with the password in the popup, the member's
  private key. Both stay in the frame's memory only. **Direct messages work there**: read and
  sent with that key, encrypted and decrypted in the frame as everywhere; the host page never
  sees a token, a key or a message text. Without the key (page reloaded, or the member left it
  locked), the Direct tab offers to unlock it in the popup again. Uploads, moderation and account
  actions are not available there.
- `frame-ancestors` for `/embed/*` is `'self'` plus exactly the approved sites; everything else
  keeps `'none'`. The API and WebSocket calls stay on this site's origin inside the frame, so no
  CORS opening is needed.
