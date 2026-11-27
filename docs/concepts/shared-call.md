<!--
File:        shared-call.md
Path:        docs/concepts/shared-call.md
Project:     Seasonal Entertainment
Description: Measurement and design note: one call shared with every game (decided 2026-11-24).
             What was measured, what each number answers, the proposed split between the
             website, the games' kit and a game, the open risks and the effort. No product code.
-->

# A call shared with the games

Decided 2026-11-24 (the owner's decisions, as facts):

- A call's organiser or an admin can mark a call as **shared with the games**.
- While a shared call is live, every game's call slot shows it. No call number is entered
  anywhere.
- Usually one game runs at a time, but nothing restricts it.
- Inside a game a member only watches and listens, as the call view's listener token does today
  ([CALLS.md](../CALLS.md), "Joining").
- A member in a call on the website can open a game and keep listening; a short interruption
  when switching is acceptable.
- After a game the player sees the result first and goes back with a **Back to the call**
  control.
- A member who is already in the call with the same account (another tab or device) gets the
  picture without sound in the game's call view, with a note that the sound plays there, and the
  sound starts in the game by itself when they leave the call page.

Decided 2026-11-25 (after the measurements; where these differ from the list above or from the
proposal below, these hold):

- A member who is already in the call with the same account (another tab or device) sees in the
  game's view only a **note** that they are in the call, **no picture**. There is no viewer
  identity: the call keeps one identity per person (the fallback of section 2).
- There is only ever **one** shared call. Sharing a second one asks to replace the first.
- **Every organiser and every admin** may share or unshare, not only the call's creator.
- When the member leaves the call page, the sound starts in the game by itself (as 2026-11-24).
- The list of games with open sign-ups on the call page (section 5) is a proposal only, not
  decided and not built.

Decided 2026-11-27: the note reads "You're in this call in another tab or on another device.
The call plays there.", since picture and sound both play there.

Status at the time of the measurements: not built. This note measures what the decisions rest on
and proposes the design; the website's part followed it (merged 2026-11-27), and the contract
as built is in [GAME-INTEGRATION.md](../GAME-INTEGRATION.md), section 9.

## Summary

| Question                                  | Answer                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Switching from the call page to a game | Works. Median 2.9 s from the click on the link to sound (N=10, dev server). Whether a second click is needed could not be measured, see below |
| 2. Same account twice                     | **Does not work as decided.** The later connection drops the earlier one, 20 of 20 times                                                      |
| 3. Sound start after leaving the page     | 50 ms (N=10) when the call page tells the view; 0.1 s plus the poll interval when the site is asked                                           |
| 4. The share flag                         | A column on the call, set by its creator or an admin; published to games by the call view itself, no game polls or is pushed to               |
| 5. Games on the call page                 | The call page has a Games link in its rail and no list of open rounds; the pieces to build one exist                                          |

## How it was measured

- The site's dev servers (API on 3800, Vite on 5380) and LiveKit 1.13.11 on this PC, `master`
  plus this branch's docs.
- Headless Chromium through Playwright, with Chrome's fake microphone for the test speaker (a
  beep, as in [NIGHT-2026-11-22.md](../NIGHT-2026-11-22.md)). The member was a throwaway account
  in the dev database, removed afterwards; its calls are ended.
- Scripts live outside the repository (a scratch folder). None is kept: they depend on the dev
  database and on this PC's ports, and the useful result is the numbers below. If the feature is
  built, its behaviour belongs in `client/e2e/` specs, written against the run's own database.
- **Background load** (this PC runs other projects at the same time): CPU 30 to 86 % over 1 s
  samples taken before and after each series, 14 cores, 5.3 to 8 GB free memory.
- **Dev servers are slower than production.** Vite serves the client as many small modules;
  the page-load part of every switching time is larger here than on the built site.
- N is 10 per series; 5 where one run takes over a minute (network cut). With N=10 the "p90" of
  a series is its maximum, so only min, median and max are given.

## 1. Switching: the call page to a game

A member listens on `/calls/<id>`, then moves **in the same tab** to a full page load of
`/games/call-test/?call=<id>` (a real game is a separate page under `/games/<slug>/`, so the
site's own client routing does not apply; the call page's connection closes when it unloads).

| Series (N=10 each)                                         | Min (ms) | Median (ms) | Max (ms) |
| ---------------------------------------------------------- | -------: | ----------: | -------: |
| Navigation to the **Listen** button visible                |     1516 |        2318 |     3224 |
| Navigation to sound playing, with a click on **Listen**    |     1766 |        2890 |     3832 |
| Navigation to sound playing, the view connecting by itself |     2453 |        3265 |     5415 |
| The same, no click on the site before (a cold start)       |     2721 |        3146 |     4891 |

"Sound playing" is an `<audio>` element of the view that is not paused and whose time has
advanced. "Connecting by itself" is **emulated** by a script inside the view's frame that does
what `useCallRoom` does (join with `listenOnly`, connect, `startAudio`); the view does not do
this today. It is not faster than the click path here because the script also loads the client
library on its own; the view's own connect would cost about the click path minus the click.

**Does the view need another Listen click after the navigation?** The measurement could not
answer this, and this is said plainly rather than assumed:

- Playwright-driven Chromium plays sound without any click: a cold page played a tone in
  headless Chromium, in headed installed Chrome and in each with
  `--autoplay-policy=document-user-activation-required` set (3 of 3 played). The same showed in
  the call: with that flag, a cold page's view connected and played with no click (N=10). So no
  run of this harness can show a block, and no "blocked" number exists.
- What the browser's rule reads was measured instead: `navigator.userActivation.hasBeenActive`
  in the game page and in the framed view after the same-tab navigation: **true in 10 of 10**
  for a link click after "Join call", for a link click from the home page, and for an address
  typed. A click on the game page also leaves it true in the same-origin frame. No path gave
  false, so there is no control showing the state can be false; it only shows the harness does
  not discriminate.
- Reading: in Chrome the rule asks for user activation on the page, and activation carries
  across a same-origin navigation and into same-origin frames (the games are on the site's
  own origin, the profile for trusted games in [GAME-INTEGRATION.md](../GAME-INTEGRATION.md)). That would make a click
  unnecessary after the member's own click on the call page. This is the documented browser
  behaviour, **not a measurement here**; Safari and Firefox are stricter and were not tried.
- What the design must do either way: the view checks `navigator.userActivation.hasBeenActive`
  and `room.canPlaybackAudio` after `startAudio()`. If the browser plays, it starts by itself;
  if not, it shows today's **Listen** button, and the sound starts on that one click (this is
  the path the owner heard on 2026-11-24). A real Chrome, Safari and Firefox run of this one
  check by the owner or on a device lab is the open item (risk 1).

## 2. The same account twice

**Decided 2026-11-25:** the fallback below — a note, no picture, no viewer identity.

The listener token uses the **same identity** as the member's speaker or listener token on the
call page: `participantFor` stores one random `p-…` identity per call and account
(`call_participants`), and `listenOnly` changes only the permissions, not the identity
(`server/src/calls/joinRoutes.js`).

LiveKit allows one connection per identity in a room, so a second join with it drops the first.
Measured with the member as a speaker on `/calls/<id>` and the same member's view in another
tab of the same browser (N=10 per order):

| Order                                     | Result                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Call page first, then the game's view     | The call page lost its connection 10 of 10 ("You left the call."); the view stayed |
| The game's view first, then the call page | The view lost its connection 10 of 10 ("You left the call."); the call page stayed |

In both orders the room held exactly one connection of that identity afterwards. The drop had
already happened when the second join returned (5 to 17 ms later the earlier page showed it).
Nothing tells the dropped page why; it says "You left the call." and offers Join.

**The decided behaviour cannot work as stated.** "Picture without sound in the game's view" needs
a second connection, and a second connection with the member's identity kills the call page's
one: the member who is speaking would be cut off by opening a game. Nearest workable behaviour:

- The view connects under **its own identity** (for example `v-<random>` stored per call and
  account in `call_participants`), as a listener, with the sound switched off on that page only
  (the view's local `muted`, as the Mute button does today). The call page's connection is not
  touched, in either order.
- The identity is a viewer: it must not count as a second person in the stage and listener
  lists ("A listener" count, the hand-raising list) and it should count once in `call_full`.
  That is the server work in the design below.
- If that is not wanted: the view shows the note and the call's title and **no** picture. That
  needs no server change but does not meet the decision.

**How the site can tell reliably that the member is already in the call.** The call server's
list of participants is the truth: the site already asks it on every join (`inRoom`, the
`present` check in `joinRoutes.js`) and knows the identity of a member in a call. A member is "in
the call" when an identity of theirs that is **not a viewer identity** is in the room. It covers
every device and tab, because it asks the call server, not the browser. Anything the browser
knows by itself (a BroadcastChannel, a storage event) covers the same browser only.

How fast the site notices a leave, asking the call server every 100 ms (the real poll adds its
own interval):

| The member leaves by              |   N | Min    | Median | Max    |
| --------------------------------- | --: | ------ | ------ | ------ |
| Clicking **Leave call**           |  10 | 103 ms | 122 ms | 217 ms |
| Closing the tab                   |  10 | 34 ms  | 45 ms  | 54 ms  |
| Network cut (offline, no goodbye) |   5 | 77.1 s | 79.2 s | 85.2 s |

A cut connection stays "in the call" for about 80 s (the call server's own timeout); the sound
then starts late for that case, which is acceptable: the other device really is, as far as
anyone can tell, still there until then.

## 3. Sound start when the member leaves the call page

The view's own connection (emulated here with a token the script mints, since the site gives no
second identity yet) receives the call's audio muted. Two ways to notice the leave:

| Method                                                                |   N | Min   | Median     | Max        |
| --------------------------------------------------------------------- | --: | ----- | ---------- | ---------- |
| The call page tells the view on a `BroadcastChannel` (same browser)   |  10 | 38 ms | 50 ms      | 82 ms      |
| The site is asked: roster check (above) plus the view's poll interval |   - | 0.1 s | + 0 to 5 s | + 0 to 5 s |

First row: from the click on **Leave call** until the view's audio is unmuted and its time has
advanced (the channel message was emulated by a click handler on the call page; the product
code would send it inside `leave()`). Second row: the 5 s is the interval the view already uses
to read the call while not joined ([GAME-INTEGRATION.md](../GAME-INTEGRATION.md), section 9), so
on average 2.5 s more and at worst 5 s; for a cut connection add the 80 s above.

Proposal: both. The channel gives the instant start when both pages are in one browser; the
poll covers another device and a closed browser.

Unmuting needs the page to be allowed to play sound (see 1); with sticky activation true it
plays, otherwise the view shows **Listen** instead of unmuting by itself.

## 4. Where the share flag fits, and how games learn of the call

**The flag.** One column on `calls`, `shared_with_games` (0 or 1, default 0):

- Set in the create form (`CALL_FIELDS`, `POST /api/calls`) and changed on a call that is
  scheduled or live by a small route `PUT /api/calls/:id/shared` (organiser). Allowed for the
  call's creator and for admins only, answered `403` otherwise (the other organisers can manage
  every call today, so this is a new, narrower rule), audited as `call.share` and `call.unshare`.
- Cleared automatically when the call ends (an ended call is not live, so it is not shown
  anyway; clearing keeps the table honest).
- Several shared calls live at once is possible ("nothing restricts it"). Games show **one**:
  the one that went live first, so a second shared call never takes the slot from the first.
  The call page of the second one still works.

**Publishing it.** Compared, for load, delay and who sees what:

|                    | A public read (as the season feed, open rounds)                                                                                                                                                                                      | A push to each game                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| How                | `GET /api/public/shared-call` → `{ "v": 1, "call": { "id", "title" } }` or `{ "call": null }`, no login; or the view itself asks it                                                                                                  | The site calls each game's endpoint when a call is shared, goes live or ends      |
| Load               | Measured: a public read of the season feed answered at 1018 requests/s with 20 clients, median 13 ms for one (N=100); `GET /api/calls/summary` 875/s. A viewer's 5 s poll is 12 reads a minute against the per-address limit of 1200 | One request per game and change; nothing between changes                          |
| Delay              | Up to the poll interval: 5 s for the view, up to 2 minutes for a game that polls like Bingo                                                                                                                                          | About 0, but a lost push has to be retried and a restarted game has to ask anyway |
| Signed-out members | See the call's title and id, which `GET /api/calls/<id>` already shows to everyone                                                                                                                                                   | Same, but the game must not pass it on unchecked                                  |
| Cost to build      | The site only                                                                                                                                                                                                                        | The site, a secret per game, retries, and each game's receiving endpoint          |

The measurement of the public read also showed the per-address read limit working: after about
1200 reads in a minute from one address the site answered `429`, so a feed must be read at a
few seconds' interval and cached (`Cache-Control: public, max-age=5`), never in a tight loop.

Proposal: the **public read, polled by the call view itself.** A game frames
`/embed/call/shared` (no call number) and the view asks the site which call is shared, every
5 s as it already does for a call it knows. The game then neither polls, nor stores an id, nor
has a push endpoint. The `ready`/`ended` messages already tell the game when to show or collapse
the slot, so "hidden while no shared call is live" needs no new message. The public read
carries minimal fields only: `id` and `title`. The view gets everything else from the existing
`GET /api/calls/<id>` (status, recording).

## 5. On the call page: the games with open rounds

Today the call page shows no game. What exists:

- The site's left navigation shows on the call page as a rail with a **Games** link
  (`callLayout.test.jsx`): a listener can leave for `/games` and see the cards.
- `GET /api/games` (public, no login) gives each card `openRounds`, soonest first
  ([OPEN-ROUNDS.md](../OPEN-ROUNDS.md)); `OpenRoundLine` and `JoinLink`
  (`client/src/games/OpenRoundHint.jsx`) show a round and its Join button for signed-in and
  signed-out visitors alike.

So a **Games with sign-up open** list on the call page, under the listener list or in the
page's side column, is reuse: one `GET /api/games`, the same two components, a few lines of
layout. Opening a game from it is a link to the round's own page, and with 1 above the member
keeps listening through the view.

## Proposed design: who builds what

### The website

- Database: `calls.shared_with_games` and, for the viewer identity, a kind on
  `call_participants` (a viewer row per call and account).
- Routes: the flag on create and `PUT /api/calls/:id/shared` (creator or admin, audited);
  `GET /api/public/shared-call`; the join for a view (`listenOnly` plus a new `viewer: true`)
  gives the viewer identity and a token that may subscribe but never publish, and does not drop
  the member's other connection.
- Room state: viewer identities excluded from the listener list, the hand list and the
  "listening" count; counted once in `call_full`.
- Call page: the "Share with the games" switch in the start and edit form; the "Games with
  sign-up open" list (5); on **Leave call** a message on the channel (3); a note for a member
  who is in the call elsewhere.
- Docs: [CALLS.md](../CALLS.md) ("Joining": the viewer identity), [GAME-INTEGRATION.md](../GAME-INTEGRATION.md)
  (section 9: the shared slot), [BACKLOG.md](../BACKLOG.md).

### The games' kit

- A call slot component that frames `/embed/call/shared?theme=…` in the slots of section 9 and
  follows `resize` and `ended`; hidden while nothing is shared. This replaces the host's
  call-id field and the check against `GET /api/calls/<id>`.
- **Back to the call**: after a round the result shows first; the control goes to
  `/calls/<id>`, the id from the view's `ready` message (the view reports the call id; the game
  never stores it).
- The view (website code, shipped with the site) starts by itself when the browser allows it
  and shows **Listen** when it does not (1); shows the picture without sound and the note when
  the member is in the call elsewhere, and unmutes by itself when they leave (2, 3).

### A game

Ideally only switching the slot on: render the kit's call slot, and offer **Back to the call**
where the result is shown. No call number, no polling, no token, no LiveKit.

## Open risks

1. **Autoplay across browsers is unmeasured.** Chrome very likely lets the view start by itself
   after the member's click on the call page; Safari and Firefox probably show **Listen**. The
   design handles both, but the claim "no second click" is not proven. One manual check in each
   browser settles it.
2. **The viewer identity is a change to the call's model.** _Not built (decided 2026-11-25),
   so this risk and risk 3 fall away._ As found: Counts, the listener list, hand
   raising, recordings' participant lists and the call's limit all assume one identity per
   person. Each of them needs a test; the recording's "who was there" in particular.
3. **A viewer connection per open game page** is one more LiveKit participant per member in a
   game, while the member also holds the call page's one. With the call limit counted once per
   member this is fine; the media cost is the listener's own (audio, and video only while the
   slot is visible, `visible: false` otherwise).
4. **Several shared calls at once.** _Decided 2026-11-25: one shared call only; sharing a
   second one asks to replace the first._ As found: The rule "the first one live" is arbitrary; an organiser
   may expect their own call to show. Needs the owner's word, or a single-shared-call rule
   (sharing a second one asks to replace the first).
5. **Who may share.** _Decided 2026-11-25: every organiser and every admin._ As found: The decision names the call's organiser or an admin. Today any organiser
   manages any call, so the narrower rule is new and must be tested for the other organisers.
6. **The network-cut case** keeps the sound off for about 80 s on the second device; documented,
   not fixable without the call server's own settings.
7. **Dev numbers.** Times above include the dev server's page load; a built site is faster, so
   they are an upper bound for page loads, not a promise.

## Effort

Estimates are for one developer including tests broken once and seen red, docs, and the CI
round trips; each in working days.

| Part                                                                        |     Days |
| --------------------------------------------------------------------------- | -------: |
| Website: flag, route, audit, public read, tests                             |      1.5 |
| Website: viewer identity (join, token, counts, lists, recordings), tests    |        3 |
| Website: the view starting by itself, the in-call note, unmuting on leave   |      2.5 |
| Website: call page switch, the games list (5), the channel message          |        2 |
| Website: docs and the browser spec (a real LiveKit, as `callEmbed.spec.js`) |      1.5 |
| The kit: the slot component, Back to the call, the contract text            |      1.5 |
| Each game: switching the slot on (three repositories, reviewed there)       | 0.5 each |
| Manual check of autoplay in Chrome, Safari and Firefox                      |      0.5 |

About **11 days** for the website and kit, and 0.5 day per game. Without the viewer identity
(the "no picture" fallback of section 2) the website's part falls by 3 days.
