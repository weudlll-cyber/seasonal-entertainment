# DESIGN.md — the SE style

The site's look is the **SE style** (approved 2026-10-20; it replaced the earlier "Arena" look
of 2026-10-17 and keeps its shell: a left sidebar, no page-level scrolling, the chat one button
away). It is built from the Seasonal Entertainment logo: the four token colours, the round
emblem and its four quarters (one per section). The approved reference — a README and four
mockups, light and dark — is kept unchanged in `docs/design/se-style/`. This file holds the
rules; the values live in `client/src/styles/tokens.css`, the single source of tokens.

## Tokens

Components use custom properties only; no component hard-codes a colour. Light is the default
set on `:root`; `:root[data-theme='dark']` replaces the colours.

**Token colours** (decided 2026-10-20), exactly these wherever a token is shown, in both themes:
Spring `#AFB84E`, Summer `#E06E22`, Autumn `#F9A825`, Winter `#04AAF7`
(`--color-spring/summer/autumn/winter`). Lightened tints of them appear only as mood surfaces
(the page's glows, the sidebar gradient), never as a token's own colour.

| Token                                | Light                                           | Dark                                                 | Use                                                   |
| ------------------------------------ | ----------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `--page-background`                  | four token glows over `#FBFAF6`                 | the glows over `#0A1233`                             | behind everything (fixed while the column scrolls)    |
| `--color-background`                 | `#FBFAF6`                                       | `#0A1233`                                            | the base colour under the glows                       |
| `--sidebar-background`               | `#E7EDC2 → #F8D9C2 → #FCE7BA → #C9E9FB`         | the token gradient at .30/.26/.24/.30 over `#0C1538` | sidebar, top bar, the phone menu                      |
| `--color-card`                       | `rgb(255 255 255 / 78%)`                        | `rgb(16 26 66 / 72%)`                                | cards on the page (translucent: the glow shows)       |
| `--color-surface`                    | `#FFFFFF`                                       | `#101A42`                                            | opaque: drawers, dialogs, fields, the call stage      |
| `--color-surface-2`                  | `#F1F3F6`                                       | `#17224F`                                            | inset areas, status pills                             |
| `--color-glass`                      | `rgb(255 255 255 / 60%)`                        | `rgb(255 255 255 / 6%)`                              | secondary buttons, icon buttons, hover                |
| `--color-text`                       | `#14171C`                                       | `#F1F4FA`                                            | body text                                             |
| `--color-text-muted`                 | `#4F5663`                                       | `#B3BCD0`                                            | secondary text, leads                                 |
| `--color-border`                     | `rgb(20 23 28 / 10%)`                           | `rgb(255 255 255 / 12%)`                             | hairlines, card edges                                 |
| `--color-border-strong`              | `#A9B0BA`                                       | `#5B6788`                                            | field outlines                                        |
| `--color-solid` / `--color-on-solid` | `#14171C` / `#FFFFFF`                           | `#F1F4FA` / `#0A1233`                                | the current navigation item, primary buttons          |
| `--banner-background`                | night-blue radial `#1D4FB8 → #0C2A7A → #081A52` | the same                                             | the home and prices banners                           |
| `--color-community`                  | `#0C2A7A`                                       | `#081A52`                                            | the home page's Community box                         |
| `--color-on-banner` / `-muted`       | `#FFFFFF` / `#D2D8E6`                           | the same                                             | text on night blue                                    |
| `--logo-lettering`                   | the logo's gradient                             | the same                                             | the "SEASONAL" lettering in the home banner           |
| `--wash-home` / `--wash-page`        | .20 / .16                                       | .26 / .20                                            | opacity of the faint logo images                      |
| `--color-on-season`                  | `#14171C`                                       | `#14171C`                                            | text and icons on a token colour (tiles, chat button) |
| `--color-danger` / `--color-success` | `#B42318` / `#1D7A46`                           | `#FF8A80` / `#4ACB8A`                                | errors, confirmations                                 |
| `--color-warning-surface`            | `#FFF4D6`                                       | `#3A2E10`                                            | the staff 2FA banner                                  |
| `--color-live` / `--color-on-live`   | `#B42318` / `#FFFFFF`                           | the same                                             | the red LIVE badge (calls)                            |
| `--color-coin-eth/pol/btc`           | `#6D4FD6` / `#C0368A` / `#1F8A7A`               | `#A796FF` / `#F07CC4` / `#4FD1BD`                    | the reference coins' lines (docs/BOTS.md)             |

Shape: `--radius` 14px for fields, `--radius-card` 28px for cards, `--radius-pill` 999px for
buttons, navigation items and badges; `--hit-target` 44px for the smallest clickable control.

**Contrast** (WCAG AA, 4.5:1 for text), measured with the translucent layers composited over
the strongest glow behind them, in both themes: body text 11.0:1 or more and muted text 5.7:1 or
more on the page and on cards; sidebar text 13.4:1 (light) and 8.9:1 (dark, muted 5.1:1); the
solid pill 16.6:1 or more; dark text on the four token colours 5.5:1 (Summer) to 9.1:1 (Autumn);
white on the banner's lightest blue 6.4:1; the Community box's muted text 9.0:1; success on
surface-2 4.8:1 (the lowest pair). One pair failed and was changed: the muted banner text
(`#D2D8E6`) is 4.1:1 on the banner's lightest blue, so the home greeting is white.

## Brand images

Made from the owner's logo file (`Seasonal Token/Seasonal Entertainment logo.png`, 1254 × 1254,
transparent; the source is only read) by `scripts/build-brand-images.mjs`, with the crop boxes
of `docs/design/se-style/README.md`, each trimmed to its content, scaled down and saved as WebP
with transparency into `client/public/brand/`:

| File                  | What                                          | Size              |
| --------------------- | --------------------------------------------- | ----------------- |
| `logo.webp`           | the full logo with lettering                  | 640 × 674, 124 KB |
| `emblem.webp`         | the round emblem without lettering            | 640 × 570, 94 KB  |
| `quarter-games.webp`  | top left: controller (Games)                  | 546 × 462, 49 KB  |
| `quarter-chat.webp`   | top right: circle of people (Chat)            | 471 × 462, 34 KB  |
| `quarter-events.webp` | bottom left: football and basketball (Events) | 451 × 443, 47 KB  |
| `quarter-calls.webp`  | bottom right: play button (Calls)             | 471 × 443, 40 KB  |
| `season-pattern.webp` | one tile of the four season marks (banners)   | 464 × 232, 21 KB  |

The pattern tile is drawn from the repo's own season marks (`client/src/assets/seasons/`), two
rows of four, the second shifted by two. `client/src/brand/brand.js` is the one place that names
these files and which quarter belongs to which section. The font stays Luxora Grotesk, and the
CSP is unchanged (all images are the site's own).

## Theme logic

1. A **stored choice** (`localStorage` key `se.theme`, `light` or `dark`) wins.
2. Otherwise the **system setting** (`prefers-color-scheme`), followed **live** while nothing is
   stored.
3. The toggle flips light/dark and stores the choice.

Every storage access is in `try/catch` (`client/src/app/storage.js`): with storage blocked the
site follows the system setting and the toggle still works for the visit.

**No flash of the wrong theme**: `client/public/theme-init.js` is a small external script loaded
synchronously in `index.html`'s `<head>` (the strict CSP forbids inline scripts, and it stays
strict). It sets `data-theme` on `<html>` before the first paint; `color-scheme` (in the tokens)
makes form controls and scrollbars match. React then takes over (`client/src/theme/`): one
`ThemeProvider` keeps `<html data-theme>` in step for every toggle. `theme.test.jsx` checks
that the early script and the module resolve the same theme in every case.

## Shell

`client/src/app/Layout.jsx`: the shell is exactly the viewport (`height: 100dvh`); `html`, `body`
and `#root` never scroll. Only the **main column** scrolls (`overflow: auto`) when its page is
taller. `client/e2e/layout.spec.js` checks this on every main page at 1440 x 900, 1280 x 720 and
1920 x 1080: nothing overflows the window, including content that would be clipped.

**From 760px wide** (the shell's one breakpoint): two columns.

1. **Sidebar**, 248px (`--sidebar-width`), on the seasons' gradient: the emblem with the
   "SEASONAL / ENTERTAINMENT" wordmark; nav items as pills with stroke icons (Home, Games, Events, Chat, Calls, Seasonal Tokens = the info
   section; Calls only when calls are set up, admins always, with a red LIVE badge while a call
   is live, docs/CALLS.md); a
   divider and Admin for admins only (as before; `staffNavFor` in `navigation.js`); at the bottom
   the account card (initial, name, role, linking to /account) or, for guests, "Log in" and
   "Register", with the theme toggle; then the legal links (Imprint, Privacy). The current item
   is the solid pill (`--color-solid`, bold, `aria-current="page"`). Games, Events, Chat and
   Calls end in a 10px dot in the colour of their quarter of the logo: Games Spring `#AFB84E`,
   Events Summer `#E06E22`, Chat Autumn `#F9A825`, Calls Winter `#04AAF7` (`dot` in
   `navigation.js`).
2. **Main column**: the routed page.

**Below 760px**: the sidebar becomes a top bar (logo, theme toggle, menu button). The menu opens
the same navigation as a drawer from the left, over a scrim: closed by its close button, Escape,
the scrim, or following a link; focus moves into it and back to the menu button.

**Pages** sit on the page background; their content blocks are translucent cards
(`--color-card`, 28px radius): forms, admin tables, info text, game cards, event days, call
cards, the chat on its page. Buttons are pills: the primary one solid, the secondary one glass
with a hairline; icon buttons are round. Fields keep a 14px radius. Every control has at least
the 44px hit target; keyboard focus always shows a ring in the accent colour. Every page shares
this background, sidebar, cards and buttons (info, login, register, account, admin, embed, the
call stage, 404).

**Home** (`LandingPage.jsx`, `homeCards.jsx`; reference `StyleBlocks2.dc.html`) fits the main
column at 1280 x 720 without scrolling. Real data only.

1. **Banner**: night blue (`--banner-background`) with the faint season pattern
   (`client/src/brand/seasonPattern.css`), the emblem, "SEASONAL" in the logo's gradient
   lettering, "ENTERTAINMENT" in white, and the greeting as the page's `h1` (with the username
   when signed in). Its height follows the window (120–190px).
2. **Featured game** (the first game of the games data; a "Coming soon" badge only when its
   status says so) and **Up next** (the event bot's next two occurrences; a dot in the season
   colours in turn, or the event's own image) side by side.
3. The **four season price tiles in one row**: each in its solid token colour with dark text,
   the name, the price large, the 24-hour change; the season mark 48px in a white 62px circle at
   the bottom right. With prices each tile opens its coin's chart (`/info/prices?coins=<id>`).
4. **Community** (the night-blue box, leading to the chat) and **Fair price & charts** (to
   `/info/prices`; without the price bot a plain note and the link to the info section).

Faint logo images behind the boxes (`--wash-home`): Featured the controller quarter, Up next the
balls quarter, Community the people quarter, Fair price the emblem. Below 1000px the boxes stack
two columns wide (tiles two by two) and the main column scrolls.

**Sub pages** (`client/src/brand/PageHeader.jsx`; reference `StyleSubpages.dc.html`): the header
has the section's quarter (64 × 56px) beside the title and a one-line lead, and the same quarter
lies large and faint (`--wash-page`) at the window's bottom right, behind the content. Games:
the controller; Events: the balls; Chat: the people; Calls: the play button.

- **Games**: larger cards with a 200px image band in the season colours in turn, the status as
  a pill above the name.
- **Events**: each day a card; each event has a bar in the season colours in turn beside its
  time.
- **Calls**: with nothing live, a "No call is live right now" card under "Live now".
- **Chat page**: the full chat fills the main column as one card, rooms on its left; only the
  message list scrolls and the composer stays at the bottom.

**Prices page** (`/info/prices`): the title on a smaller night-blue banner with the season
pattern and the four season marks on white discs.

**Login and registration**: the card shows the full logo in light mode and the emblem in dark
mode (`client/src/brand/FormLogo.jsx`; the dark lettering would vanish on night blue), but not
in the chat's small login popup.

**Room list** (`client/src/chat/RoomTabs.jsx`, layout 2026-10-18): each room is one grid row of
fixed columns — the room name (flexible, one line, cut with an ellipsis; the full name stays in
its text, so in the accessible name, and in its `title`), the unread count (2.75rem), the star
(44px) and the bell (44px). Named grid areas keep a column empty when its part is absent (no
count at 0, no toggles for guests), so every row's star and bell stand at the same x. The column
is 28% of the panel, at least 15rem and at most 18rem: "Announcements" fits beside its count and
toggles, longer names get the ellipsis, and nothing reaches into the message panel. The current
room highlights its whole row with the active background and bold text; the
name button stays the click target. Below 600px the rooms stand side by side and scroll
sideways. The drawer's room picker uses the same columns in its options (mark, name, favourite
star, count), and the Direct list keeps its stars in one column. `client/e2e/roomRows.spec.js`
checks the alignment, the one-line rows and the overlap at 1440 x 900 and 1280 x 720.

## Icons

- One set: the stroke icons of `client/src/app/icons.jsx` — a 24px grid drawn at 22px, stroke
  1.8, round caps and joins, in `currentColor` so they follow the theme. No text glyphs or emoji
  as icons (they differ per system font).
- Decorative: every icon is `aria-hidden`; the control around it carries the name or label.
- State by shape, not only by colour: the favourite star is an outline when off and filled
  (`filled`, autumn colour) when on; the room bell is a bell when sounding and a bell with a
  slash when muted. `data-icon` names the drawn icon (e.g. `star-filled`, `bellOff`) for tests.
- Small toggles (`ToggleButton`: stars, bells): a 44px hit area drawn as a compact 32px icon
  button — the hover background is clipped to the inner box and the focus ring (the accent
  outline of every control) is pulled in to the same rounded rectangle; never a circle.

**Call page** (`/calls/:id`, design "Community Call – Bühne", docs/CALLS.md), stage first: the
header across (title, LIVE badge, start time, how many speak and listen); on the left the stage
taking every bit of height left, then one row of round control buttons and the listener panel
(collapsed to one row); on the right (20rem) the call's chat, or collapsed a 3rem vertical tab
with its count of new messages. Nothing scrolls in the main column from 1280 x 720 on; only
inner lists scroll. Below 1000px the chat opens as a drawer over the page ("Show chat" in the
header). The site's chat button is not shown on a call page.

- **Sidebar as a rail** (from 760px, `SidebarRail.css`, `useRail.js`): 4.5rem (`--rail-width`),
  icons only with tooltips (`title`; the text stays the link's name), the LIVE badge and unread
  counters shrink to dots. The menu button at the top expands it until pressed again; pointing at
  the rail with a mouse slides the full sidebar over the stage (an overlay: the stage does not
  move) until the pointer leaves; keyboard focus inside opens it too. Touch screens use the
  button only. Other pages have the normal sidebar.
- **Stage**: on the surface-2 colour with the card radius. Fitting pictures (2026-10-18,
  SE-CALLS-4): shared screens are always letterboxed (`object-fit: contain`), never cropped; a
  camera shown large — alone on the stage or in the spotlight — is letterboxed too; in the grid
  of several speakers every picture takes its camera's aspect ratio (16:9 until the call service
  reports the real one) and fills it (`cover`), so at most a thin edge is cut — never more than
  about 10% of either side (`client/e2e/callFit.spec.js`). A video always fills its picture box exactly
  (positioned over it), so the box's shape decides and the fit does what it says; sized by its
  own height, a video was clipped at the bottom instead (the cut-off faces of the eye test). Speaker
  tiles: picture, name, Host or Speaker, microphone state (off: red), an accent ring while
  talking, organisers' "…" menu. Chips over the top left (pill, surface colour, raised shadow);
  the round full-screen button top right.
- **Control bar**: round 48px icon buttons in one centred row with small gaps between groups; a
  tooltip above each on hover and keyboard focus (`data-tooltip`). A toggle names what a click
  will do ("Mute microphone", "Stop sharing"); its icon shows the state: microphone or camera
  off = slashed icon and red outline, sharing = slashed screen on the accent colour, raised
  hand = autumn, end the call = the LIVE red. Questions (share with
  sound, end the call) open as a card above the bar.
- **Listeners**: chips (pill shape): an initial circle (winter blue; neutral grey with a person
  icon for hidden listeners), the name, a "Guest" tag; raised hands come first, with an
  autumn-orange border and hand symbol; organisers get a compact pill "Invite" button inside the
  chip (drawn 32px, 44px hit area). Collapsed: one row with "+N" and "Show all listeners";
  expanded: "Find a listener" (`.search-input`, `client/src/styles/forms.css`) and the list,
  capped at 12rem and scrolling inside. Every inner list on the call page scrolls with
  `overflow: auto` — a scrollbar only when its content overflows, never `overflow: scroll`.

**Chat message menu**: a message's actions sit behind a "…" button at its top right (shown on
hover and keyboard focus, always on touch screens), opening a small menu (`chat/MenuButton.jsx`,
`ChatMenu.css`) instead of a row of links; destructive actions (Hide, Ban) ask in the menu
first.

**Compact chat composer** (the drawer and a call's chat, `client/src/chat/ChatComposer.css`): one
row — a single-line message field and square 44px icon buttons (emoji/stickers/GIFs, attach,
send); the "Message" heading and the button texts are kept for screen readers only. The picker
opens above the row. The full chat page keeps its labelled text buttons.

## Chat drawer

On every page except `/chat` and `/admin/*` (`client/src/app/ChatDrawer.jsx`):

- A round **chat button** bottom right: 56px, autumn colour, a 24px chat icon
  (`--color-on-season`), with the unread dots scaled with the button (blue rooms, orange private
  messages; docs/CHAT.md, "Unread counters").
- It opens a **drawer over the page**, on the right: 400px wide, 16px from the window's top,
  right and bottom, rounded, with the raised shadow; the full width below 760px. The page
  underneath keeps its size and is never resized (`client/e2e/chatDrawer.spec.js` compares the
  main column's box).
- Drawer content: "Open full chat" (to `/chat`) and a close button; the **room picker** — a button
  with the room's colour mark, "# name" and a chevron, opening a listbox of the rooms the reader
  may read (arrows, Home/End, Enter or Space, Escape or Tab; Escape closes only the list); then
  `<ChatPanel variant="compact">` for that room, from the chat module's `index.js` (the module's
  `useChatRooms` gives the picker its rooms; the panel follows its `room` input). Rooms have no
  colour of their own: each gets a season colour by its place in the list.
- Closes by its close button or Escape. Focus moves into the drawer when the reader opens it, and
  back to the chat button when it closes; there is no focus trap (the page stays usable).
- This browser remembers, with the never-throwing storage helper, whether the drawer was open and
  the last room (`se.chatDrawer.open`, `se.chatDrawer.room`). A drawer that is open after a reload
  does not take the focus. A remembered room the reader may no longer read falls back to the
  first. The live connection is the chat module's one per page, shared with any other panel.
