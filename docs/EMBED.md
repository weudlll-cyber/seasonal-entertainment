# Embedding the chat

The chat can be placed as an iframe of `/embed/chat` on:

- **this same site's pages**: the games, which live under the main domain (decided
  2026-10-17). Built in SE-NIGHT-2 part 6.
- **other sites an admin has approved** (owner decision 2026-10-19), with direct messages
  working there too. Built in the SE-NIGHT-2 follow-up, part A.

## The embed page

`/embed/chat?room=<slug>&theme=<light|dark|auto>` shows only the chat, compact, with no site
header, sidebar or footer (`client/src/embed/EmbedChatPage.jsx`): the room, and for members a
**Rooms | Direct** tab pair as in the chat drawer.

- **room**: a room's slug, e.g. `general` or `seasonal-race`. Default `general`.
- **theme**: `light` or `dark` shows that theme in the frame without storing it; `auto`
  (default, also for any other value) follows the site's own rule: the visitor's stored choice,
  else the system setting.
- **Room rules apply unchanged**: a guest can read `general` but not `seasonal-race` (members
  only); there the frame shows "No such room." and no message field, exactly as the API answers
  a guest.

### On this site's own pages

- **Login state**: the site's own. The frame is on the same site, so the session cookie applies
  as on any page, and private messages unlock with the device unlock (docs/CHAT.md) exactly as
  on the site. Logging in happens on the site's login page (link to
  `/login?next=<the game page>`); a frame that is already open shows the new state after it
  reloads.

### On an approved other site

- **No cookie there**: browsers block or partition third-party cookies, so the frame does not
  rely on them. It shows **Log in**, which opens a small popup window **on this site**
  (`/embed-login?origin=<site>`, its address visible). There:
  - a visitor who is not logged in uses the normal login (2FA included), or registers from there:
    both return to the popup's own step, naming the site (`?next=` survives the switch from
    login to registration; `client/src/session/nextPage.js`); inside the popup these pages show
    no chat button;
  - a logged-in member sees a confirm step naming the site that asks;
  - the popup asks for the password, which opens the private key **in the popup** (the same
    derivation as everywhere, docs/AUTH.md); "Allow without private messages" skips that;
  - the popup gets an **embed token** for that site from the server and hands token, account and
    key to the frame that opened it (its opener, this same site), then closes.
- **The token** (docs/AUTH.md, "Embed tokens") is valid 12 hours, for one member and one site.
  The frame keeps it and the key **in memory only**: never in storage, since storage on another
  site is partitioned and must not outlive the page. Closing the page means logging in again next
  time. The token ends at once on **Log out** in the frame, a logout on the site, a password
  change (or anything else that moves the session epoch), a lock, or the site's removal from the
  list. The frame then forgets the account and the key on the spot and shows **Log in** again.
- **What works there**: rooms and **direct messages**, read and write under the usual rules,
  emoji, stickers and GIFs, @mentions, favourites, unread counts, mutes and reporting.
- **What does not**: uploading files (the frame shows no "Attach file" there); account, 2FA,
  key, moderation and admin actions (the server answers 403 to a token there); guests cannot
  write (a guest name needs a cookie), so a guest reads and gets **Log in to write** in place
  of the composer, the same popup as **Log in**; uploaded images in members-only rooms do not
  show (an image request cannot carry the token).
- **Private messages locked** (the page was reloaded, or "Allow without private messages"):
  the Direct tab offers **Unlock in a login window**, the same popup. The password is never typed
  into the other site's page.

## Who may frame it

The server sends, for every path under `/embed/`, `frame-ancestors 'self'` followed by exactly
the approved sites, read per request from the list (kept in memory, replaced on every change).
Everything else keeps `frame-ancestors 'none'` (`server/src/http/securityHeaders.js`); the rest
of the policy is identical. The login popup `/embed-login` cannot be framed by anyone, and it is
the one page without `Cross-Origin-Opener-Policy`: with it, the browser would cut the popup off
from the frame that opened it on the other site's page.

### Approving a site (admins)

**Admin → Embedding** (`/admin/embedding`): add a site by its address, e.g.
`https://game.example.org`. Only exact `https://` origins are allowed: no wildcards, paths,
queries or login parts. The server normalises them (lower case, no default port) and refuses
this site itself, which needs no entry. Adding and removing are audited (`embed.origin_add`,
`embed.origin_remove`). Removing a site ends every embed token for it and closes their live
connections at once. In development only, `http://` on `localhost`, `127.0.0.1` and `[::1]` can
be approved too, to try it on one machine (see "Trying it").

## The postMessage API

Every message is a plain object with a `source` and a `type`. Both sides check the other:

- The embed first determines its parent's origin (`location.ancestorOrigins`, or the referrer
  in Firefox) and asks the server whether it is this site or an approved one
  (`GET /api/embed/check?origin=`, which answers per origin without revealing the list). Until
  then, and for any other parent, it says nothing at all.
- It posts only to that origin as `targetOrigin` (never `*`). It acts only on messages whose
  `event.origin` is that origin, whose `event.source` is its own parent window, and whose
  `source` is `seasonal-chat-host`.
- Nothing secret ever goes to the host: no token, no key, no message text.
- The host page should check `event.origin` (the chat's origin, i.e. this site's),
  `event.source === frame.contentWindow` and `data.source === 'seasonal-chat'`.
- Host pages on other sites must not set `Referrer-Policy: no-referrer`: Firefox then cannot
  tell the frame who its parent is, and the frame stays silent.

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

## The snippet

The same for this site's pages (the race game) and for an approved other site; only the
address in `src` differs: a relative one on this site, the full `https://<this site>/embed/chat…`
elsewhere. In the page's HTML:

```html
<iframe
  id="se-chat"
  title="Chat"
  src="https://<this site>/embed/chat?room=seasonal-race&theme=auto"
  style="width: 100%; height: 32rem; border: 0"
></iframe>
```

and in one of the page's own JavaScript modules (this site's CSP forbids inline scripts, and
other sites should not need them either):

```js
const CHAT_ORIGIN = 'https://<this site>'; // on this site itself: window.location.origin
const frame = document.getElementById('se-chat');

// Messages from the chat: its origin and this frame only.
window.addEventListener('message', (event) => {
  if (event.origin !== CHAT_ORIGIN) return;
  if (event.source !== frame.contentWindow) return;
  const message = event.data;
  if (message?.source !== 'seasonal-chat') return;
  if (message.type === 'unread') showChatBadge(message.count); // the page's own badge
  if (message.type === 'resize') frame.style.height = `${message.height}px`; // optional
});

// To the chat: only to this frame, only at the chat's origin.
function tellChat(message) {
  frame.contentWindow.postMessage({ source: 'seasonal-chat-host', ...message }, CHAT_ORIGIN);
}

// When the page hides or shows its chat:
// tellChat({ type: 'visible', visible: false });
// When the page switches its theme:
// tellChat({ type: 'theme', theme: 'dark' });
```

`showChatBadge` stands for whatever the page does with the count. A page on another site must
allow pop-ups from the frame for **Log in** (the default in browsers, as the popup opens on a
click).

## Trying it

With the dev server running (`npm run dev`), `/test/embed-chat`
(`client/src/devPages/EmbedDemoPage.jsx`, never in production builds) frames the chat, logs what
it sends and has buttons for `visible` and `theme`.

To try another site on one machine: `http://localhost:5380` and `http://[::1]:5380` are
different sites to the browser.

1. As an admin on `http://localhost:5380`, open **Admin → Embedding** and add
   `http://[::1]:5380`.
2. On the demo page, follow **Try it as another site**: the page now runs on `http://[::1]:5380`
   and frames the chat from `http://localhost:5380`.
3. **Log in** in the frame opens the popup on `localhost`; after it closes, the frame shows your
   name, and the Direct tab your private messages.

## Tests

- `server/test/embedOrigins.test.js`: the admin list (admins only, normalised, refusals,
  audit), `frame-ancestors` per route following each change, the popup's headers, the public
  check.
- `server/test/embedTokens.test.js`: tokens only for approved sites and signed-in members;
  rooms and direct messages with a token; uploads, keys, account, 2FA, moderation, admin and
  calls refused; the token ends after 12 hours, embed logout, site logout, password change,
  lock and the site's removal; cookies unchanged.
- `server/test/embedSocket.test.js`: the WebSocket with a token (subprotocol), refused for an
  unknown token, closed at once on revocation, the member's own cookie socket untouched.
- `client/src/embed/embedChat.test.jsx`: same-site embed (panel only, login state, guests,
  theme, origin checks, unread).
- `client/src/embed/embedForeign.test.jsx`: talks only to an approved parent; the hand-over
  only from its popup; the token on requests and the socket; a guest gets "Log in to write"
  instead of the composer, a member no "Attach file".
- `client/src/embed/embedForeignDirect.test.jsx`: direct messages with the handed-over key;
  nothing secret to the host; a refused token takes account and key, and the key is gone from
  memory. (Shared setup: `client/src/test/foreignEmbed.jsx`.)
- `client/src/embed/embedLoginPopup.test.jsx`: the popup names the site, refuses unapproved
  ones, hands over only to its own opener at this origin; a wrong password or a foreign opener
  gets no token.
- `client/src/app/chatDrawer.test.jsx`: no chat button on the login and registration pages
  inside the popup.
- `client/src/admin/adminEmbedding.test.jsx`: the admin page.
- `client/e2e/embed.spec.js` and `client/e2e/embedForeign.spec.js` (real browser, real
  headers): framing per site; a member on an approved other site logs in through the popup,
  continues with cookies cleared, and exchanges private messages both ways; the host hears
  nothing secret; removing the site logs the frame out.
