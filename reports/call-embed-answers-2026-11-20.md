# A call view inside a game: answers for the shared UI kit (2026-11-20)

The games (Seasonal Mini Games, Seasonal Bingo Royale, Seasonal Party) want to reserve a slot in
their shared UI kit for a small view of a website call, beside the website chat they already
embed. Below, each question is answered from this repository's code and docs at `master`
df90fcf. Where the site had no decision, the report recommended one option. All ten
recommendations were made decisions on 2026-11-20, except question 4: its placement and sizes
follow the games' layout (decided 2026-11-20; "Why the placement changed" below).
docs/GAME-INTEGRATION.md, section 9 "Call view inside a game", states them as the contract for
games. Nothing of it is built on the site
yet; docs/BACKLOG.md lists it as waiting to be scheduled.

| #   | Question                 | Answer in one line                                                                                                                   | Status                                            |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 1   | Planned at all; how      | Was not planned. Decided: a reduced site page, `/embed/call/<id>`, framed like the chat.                                             | decided 2026-11-20 (site recommendation accepted) |
| 2   | What the view offers     | Decided: listen only (sound, speakers or spotlight, recording notice); everything else on `/calls/<id>`.                             | decided 2026-11-20 (site recommendation accepted) |
| 3   | Which call, who links it | Decided: the game host stores the site's call id; the frame reports live / ended / gone.                                             | decided 2026-11-20 (site recommendation accepted) |
| 4   | Size and placement       | Desktop: bottom right in the docked chat strip, 16:9 at its height (338 × 190, 267 × 150). Phone: a 48 px audio strip.               | decided 2026-11-20 (games' layout)                |
| 5   | Sign-in, guests          | Same-site cookie session as the chat; the 12-hour embed token is refused for calls. Guests listen on the site.                       | decided 2026-11-20 (site recommendation accepted) |
| 6   | Framing rules            | Only `/embed/` pages can be framed. Decided: only the games' own pages `/games/<slug>/` frame it.                                    | decided 2026-11-20 (site recommendation accepted) |
| 7   | postMessage API          | No call messages exist. Decided: a `seasonal-call` protocol in the chat's style.                                                     | decided 2026-11-20 (site recommendation accepted) |
| 8   | Sound                    | Sound starts only after a click. Decided: a Listen button inside the frame; game and call mute separately.                           | decided 2026-11-20 (site recommendation accepted) |
| 9   | Phone                    | The site has no picture-in-picture. Decided: the collapsed form in focus mode; the sound goes on.                                    | decided 2026-11-20 (site recommendation accepted) |
| 10  | Season colours           | `client/src/styles/tokens.css:16-19` stays the single source; the kit copies it and checks it in CI.                                 | decided 2026-11-20 (site recommendation accepted) |
| 11  | Order of work            | The site builds a reduced embed page, its protocol, docs and tests. The games may reserve the hidden slot and the call-id field now. | follows from 1–10; not scheduled                  |

## Why the placement changed

The report first placed the view above the chat at 320 × 224 or 400 × 272 px. On 2026-11-20 the
games' layout was made the rule for the view's placement, and question 4 follows it. Seasonal
Mini Games has laid out that room already. References are to `seasonal-mini-games` at `origin/master`
93ed780 (2026-11-19), read only:

- **O89** (2026-11-12, `docs/DECISIONS.md:97`): one screen without scrolling, with room beside
  the chat for a later small call view.
- **O97** (2026-11-15, `docs/DECISIONS.md:105`): on a desktop the match chat is docked **below**
  the game, full width, at a fixed height that keeps the page within 1280 × 720 without a
  scrollbar. On a phone it is a bar at the bottom that opens a sheet.
- **T350** (2026-11-15, `docs/DECISIONS.md:429`): a later call view takes a slot at the **right
  end** of the strip, with the chat beside it on the left.

**Which strip height is current: 190 px**, and 150 px in a desktop window under 760 px high:

- O99 (2026-11-15, `docs/DECISIONS.md:107`: "a little taller (190 px)");
- the spec (`docs/spec/02e-game-mind-games.md:179`);
- the code (`apps/web/src/match/chatDock.css:19` and `:24-28`; desktop from 900 px wide).

**The two Mini Games documents differ.** T350 (`docs/DECISIONS.md:429`) still gives the strip
as 180 px and the phone bar as 52 px. The spec's slot of "about 320 × 180 px, 16:9"
(`docs/spec/02e-game-mind-games.md:182`) fits that older 180 px strip, not the current 190 px
one. The same spec line cites the website's `docs/GAME-INTEGRATION.md` §8 for calls; since
2026-11-20 the call view is §9 there, and §8 is the way back. Mini Games' planning can align
them; nothing on this site depends on which is fixed first.

## 1. Is a call view inside a game planned?

**Before 2026-11-20: no.** The task brief that games copy said not to assume "embedded calls"; it
now says to reserve the call view only as a hidden slot until the site has built it
(`docs/GAME-INTEGRATION.md:464-465`). The site's calls exist only on its own pages `/calls` and
`/calls/<id>` (`docs/CALLS.md:58-69`, `docs/CALLS.md:300-343`). No page under `/embed/` shows a
call. An embed token is refused for the calls routes (`server/src/embed/auth.js:13`,
`server/test/embedTokens.test.js:107`). This repository had no plan for a call view inside a
game. Bingo's `host_call_ref` is in Bingo's own spec, not here.

**How: decided 2026-11-20.**

**A reduced call page from the site, framed like the chat**
(`/embed/call/<id>?theme=…`), not the game connecting to LiveKit itself. The reasons:

- The site is the only authority in a call: who joins, what they may do, the spotlight, hands
  and ending (`docs/CALLS.md:18-23`).
- The checks around joining all happen on the site:
  - the join token lasts 10 minutes (`docs/CALLS.md:227-235`);
  - permissions are per role (`docs/CALLS.md:237-246`);
  - joining a call that is being recorded needs consent (`docs/CALLS.md:581-585`);
  - bans and the participant cap (`docs/CALLS.md:229-231`).

  A game that connected itself would need all of these again, plus a new token route for games.

- A framed page under `/embed/` already gets the right headers: `frame-ancestors 'self'` and
  the call service in `connect-src` (`server/src/http/securityHeaders.js:51-57`,
  `server/src/http/securityHeaders.js:86`).
- The games are on the site's own origin (`docs/GAME-INTEGRATION.md:53-66`), so a frame there
  works like the chat's, with nothing to approve (`docs/EMBED.md:66-68`).

## 2. What the in-game view offers

**On the site today:** the call page has everything:

- the stage with up to 10 speakers and a spotlight (`docs/CALLS.md:313-324`);
- the control bar: microphone, camera, screen share, leave the stage, raise a hand, end the call
  and leave (`docs/CALLS.md:325-332`);
- the listener list with Invite (`docs/CALLS.md:333-339`);
- the call's chat (`docs/CALLS.md:340-343`).

Listeners never publish. Guests cannot raise a hand and are never given publishing
(`docs/CALLS.md:237-243`, `docs/CALLS.md:248`).

**For the view: decided 2026-11-20.**

**Listen only to start with.** The view would show:

- the call's sound;
- the spotlight speaker, or the speaker grid scaled down;
- the red "Recording" mark, and the consent question before joining a recorded call
  (`docs/CALLS.md:577-585`);
- "Leave";
- a link "Open the call page" to `/calls/<id>`.

These stay on the call page only:

- raising a hand and joining the stage;
- the microphone, camera and screen share;
- the organisers' controls: Invite, Mute, Spotlight, End, polls (`docs/CALLS.md:397-399`) and
  recording;
- the listener list and the call's chat. The game already has the website chat beside it.

The reason: a listener needs no microphone permission. The stage needs room for the 48 px
control bar (`docs/DESIGN.md:536-541`), and a small slot has none. Raising a hand can come later
as a second step: it would also need the stage controls in the frame.

## 3. Which call a game shows

**Facts on the site:**

- **Who manages calls:** organisers and admins with 2FA create, start and end calls
  (`docs/CALLS.md:65-68`). Anyone may see the list and a call
  (`server/src/calls/routes.js:138`, `server/src/calls/routes.js:168`, both
  `allow('public')`).
- **A call's status** goes `scheduled` → `live` → `ended` and never back
  (`docs/CALLS.md:86-91`). A live call whose LiveKit room is gone is ended after 10 minutes
  (`docs/CALLS.md:92-101`).
- **Deleting:** only admins may delete a call, and only an ended one
  (`docs/CALLS.md:110-116`).
- **The one existing link to a call** is the event bot's occurrence. When the occurrence goes,
  the call loses the link with no error (`docs/CALLS.md:119`, `docs/CALLS.md:180-182`).
- **Nothing links a call to a game round or lobby**; the site has no field for it.

**Linking: decided 2026-11-20.**

- **What the game stores:** the site's numeric call id (Bingo's `host_call_ref`), entered as the
  id or pasted as the address `/calls/<id>`.
- **Who links it:** only the game's host. That person holds `Can-Host` for this game
  (`docs/AUTH.md:854-856`, `docs/AUTH.md:894`), enforced by the game's server. The site needs no
  new right: a call is public anyway, and linking it reveals nothing. No extra 2FA is needed,
  because the call itself was made by an organiser with 2FA.
- **Checking the call:** the game checks the id with `GET /api/calls/<id>` (public) and accepts
  only a scheduled or live call.
- **What the frame shows:**
  - a scheduled call: "Not started yet";
  - when the call ends: "The call has ended", and it posts `ended`. The LiveKit client already
    tells "ended" (room deleted) from "left" (`client/src/calls/useCallRoom.js:96-98`);
  - a deleted call (`404`): the same, with `ended` and `reason: 'gone'`.
- **What the game does:** it keeps the round running and collapses or hides the slot. It never
  ends the round because of the call, just as the site keeps a call when its event link goes.

## 4. Size and placement

**Facts on the site:**

- The call page's chat column is 20rem (320 px) wide, or a 3rem tab when collapsed. Below
  1000 px it becomes a drawer (`docs/DESIGN.md:509-515`).
- Pictures are 16:9 until the camera reports its real shape (`docs/DESIGN.md:524-531`).
- The smallest control is 44 × 44 px (`docs/DESIGN.md:47`, `docs/DESIGN.md:131`).

**Facts in Seasonal Mini Games** (`seasonal-mini-games` `origin/master` 93ed780, see "Why the placement
changed"):

- **Desktop:** the docked chat is a full-width strip under the game, 190 px high, or 150 px in a
  window under 760 px high (`docs/spec/02e-game-mind-games.md:179`;
  `apps/web/src/match/chatDock.css:19`, `:24-28`).
- **Phone:** the chat bar sits at the bottom, part of the layout, never over the content
  (`docs/spec/02e-game-mind-games.md:180`). The winners, the cards and the countdown must show
  above it without scrolling at 390 × 844 and 360 × 740 (`docs/spec/02e-game-mind-games.md:193`).

**Decided 2026-11-20 (the games' layout):**

| Where                             | Slot (CSS px)                                    | Notes                                                    |
| --------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Desktop, normal window            | **338 × 190**                                    | the strip's height at 16:9 (190 × 16/9 = 337.8)          |
| Desktop, window under 760 px high | **267 × 150**                                    | the low strip at 16:9 (150 × 16/9 = 266.7); the smallest |
| Desktop, collapsed                | **48 × the strip's height** (48 × 190, 48 × 150) | the audio-only form                                      |
| Phone portrait                    | **full width × 48**, the audio strip             | the picture on tap: full width × width × 9/16            |

**Desktop: bottom right.** The view sits at the right end of the docked chat strip (T350,
`docs/DECISIONS.md:429`), with the chat card beside it on the left taking the rest of the width.

- **Its own box, at the strip's full height.** It is not inside the chat card's 12 px padding
  (`apps/web/src/match/chatDock.css:31-39`), so the picture fills the whole 190 or 150 px.
- **No control bar below the picture.** Everything sits as an overlay inside the 16:9 picture,
  on a dark translucent backing so text and icons keep 4.5:1:
  - the picture: the spotlight speaker or the speakers, letterboxed like the call page
    (`docs/DESIGN.md:524-526`);
  - top left: the red **Recording** mark while a recording runs (`docs/CALLS.md:577-579`);
  - top right: **Open the call page**, a 44 px icon link to `/calls/<id>`, and **Collapse**, 44 px;
  - before listening: the **Listen** button in the middle, a pill 44 px high;
  - while listening: **Mute** and **Leave** at the bottom right, 44 px each.
- **The smallest size at which this works is 267 × 150**, the low-window strip. There, a top row
  and a bottom row of 44 px controls with 8 px margins leave 46 px of free picture between them.
  The top row needs about 210 px: the Recording mark, two 44 px buttons and the gaps. Smaller
  than that, the view shows only the collapsed form.
- **Collapsed** (the audio-only form): a 48 px wide column at the strip's right end, at the
  strip's height, like the call page's collapsed chat tab (`docs/DESIGN.md:512-513`). Top to
  bottom it holds:
  - a LIVE dot, and a red dot while a recording runs;
  - **Listen** or **Mute**, 44 px, with a ring while someone on the stage talks;
  - **Expand**, 44 px.

  In 150 px that is two 44 px buttons, the dots and the gaps. Leave is in the expanded view;
  closing the slot also leaves. The chat card takes the width the picture gave up.

**Phone: the 48 px audio strip stays.** Mini Games' phone layout does not contradict it.

- **Where it sits:** directly above the chat bar, full width with the bar's 10 px side margins
  (`apps/web/src/match/chatDock.css:58-60`). Like the bar, it is part of the layout and never
  over the content (`docs/spec/02e-game-mind-games.md:180`).
- **What it holds:**
  - the LIVE and recording marks;
  - the name of whoever is speaking;
  - **Listen** or **Mute**, 44 px;
  - **Expand**, 44 px.
- **Expand** opens the picture, full width × width × 9/16 (390 → 219 px), at the top of the chat
  sheet's place: the sheet lies between the round bar and the chat bar (T350,
  `docs/DECISIONS.md:429`). Leave and Open the call page sit there.
- **The chat bar is no longer 52 px.** T350 (`docs/DECISIONS.md:429`) gives 52 px, but that
  was before O99 (`docs/DECISIONS.md:107`). Since O99 the bar holds two rows: the row "Chat ·
  <newest message>", at least 44 px (`apps/web/src/match/chatDock.css:72-74`), and under it the
  field with Send (`apps/web/src/match/chatDock.css:11-13`). The spec gives the bar no height
  (`docs/spec/02e-game-mind-games.md:180`). The strip does not depend on the bar's height.
- **What the games must check:** the strip takes 48 px more from the content. Mini Games'
  planning must check that its 390 × 844 and 360 × 740 rule still holds while a call is linked
  (`docs/spec/02e-game-mind-games.md:193`). With no call linked, the strip is not there.

## 5. Sign-in

**Decided on the site:**

- On the site's own pages, the chat frame uses the site's own session cookie
  (`docs/EMBED.md:31-37`, `docs/GAME-INTEGRATION.md:194-196`). A call frame inside a game on the
  same origin would get the same session with nothing more to do.
- The **12-hour embed token** (`docs/EMBED.md:84-91`) is only for approved other sites. It is
  refused for calls (`docs/EMBED.md:94`, `docs/EMBED.md:273-276`, `server/src/embed/auth.js:13`).
- **Guests may listen** to a call on the site, by their chat guest identity
  (`docs/CALLS.md:227-229`, `docs/CALLS.md:239`). They never publish and never raise a hand
  (`docs/CALLS.md:243`, `docs/CALLS.md:248`).

**For the view: decided 2026-11-20:**

- the site's cookie session, exactly like the chat;
- guests listen as on the site;
- no embed token for calls: on other sites, calls stay refused for now.

## 6. Framing rules

**Decided on the site:**

- Only pages under `/embed/` may be framed: by this site (`'self'`) and by the sites an admin
  approved. Every other page has `frame-ancestors 'none'` (`server/src/http/securityHeaders.js:12-14`,
  `server/src/http/securityHeaders.js:37`, `server/src/http/securityHeaders.js:56`,
  `server/src/http/securityHeaders.js:86`; `docs/EMBED.md:154-159`). So `/calls/<id>` cannot be
  framed today.
- Every response carries `Permissions-Policy: camera=(self), microphone=(self),
display-capture=(self)` (`server/src/http/securityHeaders.js:40`,
  `server/src/http/securityHeaders.js:85`; `docs/CALLS.md:807-812`).
- The game must already allow the chat frame in its own `frame-src` and keep a referrer
  (`strict-origin`) (`docs/GAME-INTEGRATION.md:201-205`; `docs/EMBED.md:187-188`).

**For a call view: decided 2026-11-20:**

- **Who may frame it:** only this site's own pages, that is the games under `/games/<slug>/`.
  It would not use the chat's approval list: embed tokens refuse calls, so another site would
  need a separate decision.
- **What the game page sets:**
  - `frame-src 'self'`, as for the chat;
  - no `Permissions-Policy` of its own that turns off `autoplay` or `fullscreen`;
  - `<iframe allow="autoplay; fullscreen">` on the frame.
- **Microphone and camera:** with listening only, no `microphone`, `camera` or `display-capture`
  in `allow`. They would come only with the stage, if that is ever decided (question 2).

## 7. postMessage API

**On the site:** only the chat's messages exist:

- from the chat: `ready`, `unread`, `resize`;
- to the chat: `visible`, `theme`.

Both sides check the origin, the window and `source`. Messages go only to the explicit origin,
never `*`, and nothing secret is sent (`docs/EMBED.md:173-203`;
`client/src/embed/embedProtocol.js`). There are no call messages.

**Decided 2026-11-20**, in the chat's style: `source:
'seasonal-call'` from the view and `'seasonal-call-host'` to it, with the same checks.

| From the view | Fields                                                         | When                                                                                              |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ready`       | `call` (id), `status` (`scheduled`/`live`/`ended`), `signedIn` | once the call is known; again when either changes                                                 |
| `live`        | `listening` (bool)                                             | the call went live; the visitor started/stopped                                                   |
| `ended`       | `reason` (`ended`/`gone`)                                      | ended on the site, or deleted / not found                                                         |
| `speaking`    | `active` (bool)                                                | someone on the stage talks / silence (no names)                                                   |
| `resize`      | `mode` (`picture`/`collapsed`), `width`, `height` (px)         | the view wants the other form: 16:9 at the strip's height, or 48 px wide (phone: the 48 px strip) |
| `error`       | `code` (e.g. `call_full`, `banned`, `recording_consent`)       | joining failed; the view shows the text itself                                                    |

| To the view | Fields                            | Effect                                               |
| ----------- | --------------------------------- | ---------------------------------------------------- |
| `mute`      | `muted` (bool)                    | silences the view's sound locally; stays joined      |
| `collapse`  | `collapsed` (bool)                | the picture or the collapsed form (phone: the strip) |
| `theme`     | `theme` (`light`, `dark`, `auto`) | as the chat's `theme`                                |
| `visible`   | `visible` (bool)                  | out of sight: the view stops receiving video         |

The host sizes the frame from its own strip (question 4): the view reads its height from the
frame and draws 16:9 within it. `resize` only asks for the other form.

Like the chat, it sends nothing secret: no token, no identities, no participant names. The
`error` codes are the join route's own (`docs/CALLS.md:227-231`, `docs/CALLS.md:584`).

## 8. Sound

**On the site:** browsers block sound until the visitor clicks. So the call page connects, and
starts its sound, only on **Join call** (`docs/CALLS.md:306-308`;
`client/src/calls/useCallRoom.js:111-112` with `connect`, then `startAudio`). The media elements
are set to autoplay (`client/src/calls/TrackMedia.jsx:48`, `client/src/calls/TrackMedia.jsx:63`).

**For the view: decided 2026-11-20:**

- **A Listen button inside the frame.** A click in the game page does not count as a click inside
  the frame. The view connects only on that click, as the site's page does. The button sits in the
  middle of the picture before listening. In the collapsed form and in the phone strip it is
  the 44 px Listen button, which then becomes Mute (question 4).
- **The game's own sound** plays on beside it. The game may turn its own sound down while
  `speaking` is true; that is the game's choice.
- **Who mutes what:**
  - the view's own mute button and the host's `mute` message silence only the call's sound;
  - the game's controls silence only the game;
  - neither ever touches a speaker's microphone. That stays the organisers' Mute on the call
    page (`docs/CALLS.md:262-263`).

## 9. Phone

**On the site:**

- Below 1000 px the call page's chat becomes a drawer (`docs/DESIGN.md:514`).
- Full screen is offered where the Fullscreen API exists (`docs/CALLS.md:322-324`).
- There is no picture-in-picture in `client/src/calls/`.

**For the view: decided 2026-11-20:**

- On phones the view opens as the 48 px audio strip above the chat bar; the picture opens on tap
  (question 4).
- In the game's focus mode it shows its collapsed form: the 48 px column on a desktop, the strip
  on a phone. It may also be hidden with `visible: false`. Its sound keeps playing until the
  visitor stops it.
- No picture-in-picture in the first version. Browser support differs, and the strip already
  keeps the sound going.

## 10. Season colours

**Decided:**

- The site's single source of tokens is `client/src/styles/tokens.css` (`docs/DESIGN.md:7-8`).
- The four token colours, the same in light and dark (decided 2026-10-20, `docs/DESIGN.md:15-17`),
  are:

  | Season | Value     | Where                             |
  | ------ | --------- | --------------------------------- |
  | Spring | `#AFB84E` | `client/src/styles/tokens.css:16` |
  | Summer | `#E06E22` | `client/src/styles/tokens.css:17` |
  | Autumn | `#F9A825` | `client/src/styles/tokens.css:18` |
  | Winter | `#04AAF7` | `client/src/styles/tokens.css:19` |

- Text on these colours is `#14171C` (`--color-on-season`, `client/src/styles/tokens.css:26`,
  `docs/DESIGN.md:39`).

**The shared kit copying them and checking them in CI: decided 2026-11-20.** The site has no
file or route that publishes them for other repositories, and needs none.

**Yes.** The site stays the single source. The kit keeps a copy of the four values
plus `--color-on-season`, and its CI compares the copy with `client/src/styles/tokens.css` on the
site's `master`, failing on a difference. A change on the site then shows up as a red kit build,
not as a quiet drift. The site needs nothing new for this.

## 11. Order of work

What the site would build, now that questions 1–10 are decided (2026-11-20):

1. **Scheduling** by the owner (docs/BACKLOG.md, "Decided, waiting to be scheduled").
2. **A reduced call page** under `/embed/`, for example `client/src/embed/EmbedCallPage.jsx`.
   It would show the stage scaled down with its controls over the picture, the Listen button,
   the recording consent and the collapsed form, reusing `client/src/calls/useCallRoom.js`. Being under `/embed/`, it is already
   framable by the site's own pages (`server/src/http/securityHeaders.js:86`). No new join route
   is needed: same-site requests carry the cookie.
3. **The `seasonal-call` messages** of question 7, next to `client/src/embed/embedProtocol.js`.
4. **Docs:**
   - in `docs/CALLS.md` and `docs/EMBED.md`, a section for the call view;
   - in `docs/GAME-INTEGRATION.md`, section 9 changed from "not built" to built (the section,
     its contract row, checklist line and the brief's clause were written on 2026-11-20);
   - in `docs/BACKLOG.md`, the entry moved to part two.
5. **Tests:**
   - the frame's headers per route;
   - guests listening;
   - ended and deleted calls posting `ended`;
   - no secret posted to the host;
   - a browser run in a game-like page.

What the games can reserve now, without waiting:

- **An empty slot** at the right end of the docked chat strip on a desktop: 338 × 190 px, or
  267 × 150 px in a window under 760 px high, able to collapse to 48 px wide. On a phone, a
  48 px strip above the chat bar. It stays **hidden while no call is linked**, so nothing
  changes for players today.
- **A place for the call id** in the round or lobby (Bingo's `host_call_ref`). It is set only by
  the game's host and checked against `GET /api/calls/<id>`.
- **Not yet:** framing any site page into the slot. Today no `/embed/` call page exists, and
  `/calls/<id>` refuses to be framed (`server/src/http/securityHeaders.js:37`).
