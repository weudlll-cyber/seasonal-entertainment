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
| `--chat-list-max-height` | CSS custom property     | `60vh` / `18rem` | cap of the message list; `none` lets it fill a container of fixed height |
| account                  | from `SessionProvider`  | —                | who is signed in (`client/src/session`); a guest if no                   |

`index.js` also exports **`useChatRooms()`**: the rooms the current reader may read and who they
are in the chat (`{ info: { rooms, me }, error, reload }`), for a host's own room picker (the
site's chat drawer, docs/DESIGN.md). The panel itself uses the same hook.

The module uses nothing else from the page around it. From outside its folder it imports only
React, the shared chat rules (`@seasonal-entertainment/shared/chatRules.js`), the account context
(`client/src/session/SessionContext.jsx`) and the site's API client (`client/src/api/http.js`);
`client/src/chat/chatModule.test.js` fails on any other import, and on any page importing a file
of the module other than `index.js`.

- **Styles** sit under one root class, `.se-chat` (`ChatPanel.css`, `ChatMessage.css`,
  `ChatPicker.css`), with the module's own buttons and notices. Colours and spacing come from the
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
- **The composer** writes one message at a time: optional text plus at most one attachment. A
  sticker or GIF from the picker is shown small above the field with an ×; Send sends both
  together (`{ body, attachment }` to `POST /api/chat/rooms/<room>/messages`). Members also
  get **Attach file** (images and PDFs): the file is uploaded first (`POST /api/chat/uploads`)
  and then sent like any attachment; uploaded files are fetched only through the access-checked
  `/api/chat/files/...` (ARCHITECTURE.md, "Chat").
- **The message list** (`MessageList.jsx`, `useScrollPin.js`) opens at the newest message and
  stays pinned to it while the reader is at or near the bottom (48 px), also when an image or a
  preview card makes the newest message grow; a reader who scrolled up is not moved and gets a
  "New messages" button that scrolls down. A room switch starts at the newest message again.
  The same in both variants.
- **Layout**: a panel is a column that fills the height its container gives it; the message list
  takes the room left and the composer stays at the bottom. `full` fills its container (the
  `/chat` page's main column), with room tabs as a column on the left (a row below 600px).
  `compact` caps its list at 18rem unless the host sets `--chat-list-max-height`.
- **No page paths or layout assumptions** inside the module: it calls the API and the WebSocket on
  the page's own origin (`/api/chat/...`, `/ws/chat`, `/media/...`) and fits the width it is given.
- **Test-only page** `/test/chat-panels` (two compact panels side by side) is routed by the Vite
  dev server only; production builds leave it out (`import.meta.env.DEV`).

## Server: `mountChat()`

`server/src/chat/mount.js` mounts the whole chat area — rooms and messages, moderation, the
sticker/GIF library (`server/src/media/`), link previews (`server/src/previews/`), members' file
uploads (`server/src/uploads/`), the WebSocket hub and the retention job:

```js
const chat = mountChat({ app, api, db, config, sessionParser, previewNetwork });
// chat.sessions.ended(sessionId)                 logout: close that session's sockets
// chat.sessions.accountChanged(userId, keepSid)  role, lock, password, 2FA: close the account's sockets
// chat.attach(httpServer)                        the WebSocket, once the server listens
// await chat.start()                             first-start rooms and media, retention job
```

`api` is the `/api` router after sessions, the current user and the 2FA gate; call `mountChat`
before the API's catch-all 404. Outside the chat area only `mount.js` (and the table definitions
the database layer registers) may be imported; `server/test/chatBoundary.test.js` enforces it.

## Embedding in other applications (next task)

Still needed before the panel can run inside the race game or on another site:

- **An embed route**: a minimal page that shows one `<ChatPanel>` (room and variant from the URL),
  without the site's header and footer.
- **Allowed embedding origins**: a configured list of sites that may frame the embed route.
- **`frame-ancestors`** in the Content-Security-Policy of the embed route only, set from that list
  (everything else keeps `frame-ancestors 'none'`).
- **Login inside an embedded frame**: third-party cookies are blocked in many browsers, so the
  session cookie (`SameSite=Lax`) does not reach a framed page; a sign-in flow that works in a
  frame (for example a pop-up and a short-lived token) is needed for members.
- **Cross-origin API and WebSocket**: the origin checks (CSRF and WebSocket) accept only this site
  today; the embed route keeps all calls on this site's origin, so no CORS opening is needed as
  long as the panel runs inside that frame.
