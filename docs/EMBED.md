# Embedding the chat

The chat can be placed on other pages of **this same site** — the games, which live under the
main domain (decided 2026-10-17) — as an iframe of `/embed/chat`. Built in SE-NIGHT-2 part 6.

## The embed page

`/embed/chat?room=<slug>&theme=<light|dark|auto>` shows only the chat panel (compact), with no
site header, sidebar or footer (`client/src/embed/EmbedChatPage.jsx`).

- **room**: a room's slug, e.g. `general` or `seasonal-race`. Default `general`.
- **theme**: `light` or `dark` shows that theme in the frame without storing it; `auto`
  (default, also for any other value) follows the site's own rule: the visitor's stored choice,
  else the system setting.
- **Login state**: the site's own. The frame is on the same site, so the session cookie applies
  as on any page: a signed-in member writes as themselves, a guest as a guest. Logging in
  happens on the site's login page (link to `/login?next=<the game page>`). A frame that is
  already open shows the new state after it reloads.
- **Room rules apply unchanged**: a guest can read and write `general` where guests may, but
  not `seasonal-race` (members only); there the frame shows "No such room." and no message
  field, exactly as the API answers a guest.

## Who may frame it

Only pages of the site's own origin. The server sends `frame-ancestors 'self'` for every path
under `/embed/` and keeps `frame-ancestors 'none'` everywhere else
(`server/src/http/securityHeaders.js`); the rest of the policy is identical. A page on any
other origin, including a subdomain, gets the browser's refusal instead of the chat. Embedding
on other sites (other origins, login inside a third-party frame) is a separate backlog item.

## The postMessage API

Every message is a plain object with a `source` and a `type`. Both sides check the other:

- The embed posts only to its own parent, with the site's origin as `targetOrigin` (never `*`),
  so a parent on another origin receives nothing.
- The embed acts only on messages whose `event.origin` is the site's origin, whose
  `event.source` is its own parent window, and whose `source` is `seasonal-chat-host`.
- The host page should check `event.origin === window.location.origin`,
  `event.source === frame.contentWindow` and `data.source === 'seasonal-chat'`.

### From the chat (`source: 'seasonal-chat'`)

| `type`   | Fields             | When                                                                                                             |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `ready`  | `room`, `signedIn` | Once the account is known (and again if it changes).                                                             |
| `unread` | `room`, `count`    | Messages that arrived while the host said the chat is out of sight (`visible: false`); 0 again when it is shown. |
| `resize` | `height` (px)      | The content's height changed, for a host that sizes the frame.                                                   |

### To the chat (`source: 'seasonal-chat-host'`)

| `type`    | Fields                            | Effect                                                |
| --------- | --------------------------------- | ----------------------------------------------------- |
| `visible` | `visible` (`true` / `false`)      | Out of sight: count new messages (`unread`).          |
| `theme`   | `theme` (`light`, `dark`, `auto`) | Switches the frame's theme, as the `theme` parameter. |

## The snippet for the race game

The race game's page (under the main domain) puts this in its HTML:

```html
<iframe
  id="se-chat"
  title="Chat"
  src="/embed/chat?room=seasonal-race&theme=auto"
  style="width: 100%; height: 32rem; border: 0"
></iframe>
```

and this in one of its own JavaScript modules. The site's Content-Security-Policy forbids inline
scripts, so the code must not sit in a `<script>` block:

```js
const frame = document.getElementById('se-chat');

// Messages from the chat: this origin and this frame only.
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== frame.contentWindow) return;
  const message = event.data;
  if (message?.source !== 'seasonal-chat') return;
  if (message.type === 'unread') showChatBadge(message.count); // the game's own badge
  if (message.type === 'resize') frame.style.height = `${message.height}px`; // optional
});

// To the chat: only to this frame, only on this origin.
function tellChat(message) {
  frame.contentWindow.postMessage(
    { source: 'seasonal-chat-host', ...message },
    window.location.origin
  );
}

// When the game hides or shows its chat:
// tellChat({ type: 'visible', visible: false });
// When the game switches its theme:
// tellChat({ type: 'theme', theme: 'dark' });
```

`showChatBadge` stands for whatever the game does with the count. Members-only rooms such as
`seasonal-race` show guests the refusal described above; a game that wants guests to chat uses
`room=general`.

## Trying it

With the dev server running, `/test/embed-chat` (`client/src/devPages/EmbedDemoPage.jsx`,
never in production builds) frames the chat as above, logs what it sends and has buttons for
`visible` and `theme`.

## Tests

- `client/src/embed/embedChat.test.jsx`: panel only, login state, guest room rules, `?theme=`
  not stored, origin, parent and source checks, the unread count while hidden.
- `server/test/securityHeaders.test.js`: `frame-ancestors 'self'` for `/embed/` only.
- `client/e2e/embed.spec.js` (real browser, real headers): a page of this site frames the chat,
  other pages cannot be framed, another origin cannot frame the chat, and the demo page
  receives `ready` and `unread`.
