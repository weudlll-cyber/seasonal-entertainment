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
| `--color-warning-surface`            | `#FFF4D6`                                       | `#3A2E10`                                            | the 2FA banner, the site banner's warning style       |
| `--color-info-surface`               | `#E1F3FD`                                       | `#0F2D55`                                            | the site banner's info style (a winter tint)          |
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

**Dialogs over the page** (`.modal` with its backdrop and actions, `styles/base.css`): a card
with the solid `--color-surface`, never the translucent `--color-card`, so their text never sits
on the page behind them, in both themes (2026-10-22). The recovery-code offer, a new device
asking for the key and the call recording's question all use it.

## Brand images

Made from the owner's logo file (`Seasonal Token/Seasonal Entertainment logo.png`, 1254 × 1254,
transparent; the source is only read) by `scripts/build-brand-images.mjs`, with the crop boxes
of `docs/design/se-style/README.md`, each trimmed to its content, scaled down and saved as WebP
with transparency into `client/public/brand/`:

| File                  | What                                          | Size             |
| --------------------- | --------------------------------------------- | ---------------- |
| `logo.webp`           | the full logo with lettering                  | 320 × 337, 47 KB |
| `emblem.webp`         | the round emblem without lettering            | 420 × 374, 52 KB |
| `quarter-games.webp`  | top left: controller (Games)                  | 400 × 338, 33 KB |
| `quarter-chat.webp`   | top right: circle of people (Chat)            | 400 × 392, 28 KB |
| `quarter-events.webp` | bottom left: football and basketball (Events) | 400 × 393, 40 KB |
| `quarter-calls.webp`  | bottom right: play button (Calls)             | 400 × 376, 33 KB |
| `season-pattern.webp` | one tile of the four season marks (banners)   | 464 × 232, 21 KB |

The pattern tile is drawn from the repo's own season marks (`client/src/assets/seasons/`), two
rows of four, the second shifted by two. `client/src/brand/brand.js` is the one place that names
these files and which quarter belongs to which section. The font stays Luxora Grotesk (headings
in Bold, `--font-weight-heading` 700, decided 2026-10-21; Heavy before), and the
CSP is unchanged (all images are the site's own).

## Installable site

The site can be installed as an app (decided 2026-11-10): `client/public/manifest.webmanifest`
(name "Seasonal Entertainment", short name "Seasonal", start `/`, standalone, theme colour
`#0c1538` (the night blue, also `<meta name="theme-color">`), background `#fbfaf6`
(`--color-background`)), linked from `client/index.html` with the Apple touch icon. The icons
are made from the emblem by `scripts/build-app-icons.mjs` into `client/public/icons/`:

| File                    | What                                                |
| ----------------------- | --------------------------------------------------- |
| `icon-192.png`          | the emblem, transparent around it                   |
| `icon-512.png`          | the same, larger (scaled up from the 420 px emblem) |
| `icon-maskable-512.png` | the emblem in the 80 % safe zone on night blue      |
| `apple-touch-icon.png`  | 180 px on the page background (iOS shows no alpha)  |

The service worker (`client/src/app/sw.js`, served as `/sw.js` with the shared path rule by `client/serviceWorkerPlugin.js`) is there only for installing and the one web push
(docs/CALLS.md, "Push when a call starts"): it caches nothing, so every page and answer still
comes from the network and an update reaches visitors as before ("Speed").

## Speed

Measured on the production build, and kept by `client/e2e/speed.spec.js` and
`client/src/brand/brandImages.test.js` (decided 2026-10-21):

- **Pages loaded on first use** (`React.lazy` in `App.jsx`): the call page (with the call
  service's client), the prices page, info pages (with the Markdown renderer), the admin area
  and the embedded chat each come as their own chunk. `Layout` and `AdminLayout` hold the
  `Suspense` boundaries, so the shell stays while a page arrives. The JavaScript every page
  loads first went from 293 KB to 113 KB (gzip).
- **Hashed files are kept a year**: everything in `assets/` is named by its content, so the
  server sends it with `Cache-Control: public, max-age=31536000, immutable`
  (`server/src/app.js`). The page itself, `/brand/` and `theme-init.js` are checked on every
  visit.
- **Image sizes**: each brand image is at most twice its largest size on the page (the faint
  quarters once, as they show at 16–26 %), and at most 60 KB. The faint images on the home
  boxes, game card pictures and event pictures load lazily.
- **No jumping while data arrives**: on narrow screens the featured game (15rem) and "Up next"
  (16.5rem: two events whose names wrap) keep their room from the start, and on the prices page
  the coin buttons stand empty and disabled until their prices arrive. A late answer moves
  nothing below (layout shift under 0.05). On a phone (2026-11-01) the featured game's content
  starts at the top (centred, its label jumped up 87px when the game arrived), and the banner's
  season clock has fixed room for its longest form (its "Next halving" line takes one or two
  lines depending on the date and on whether the web font has arrived). `speed.spec.js` checks
  it on three pinned dates (UTC), with games and events answered a second late.
- **Fonts**: `font-display: swap`, unchanged. Preloading the four faces was measured and made
  the first paint later (464 vs 400 ms) without a gain in layout shift, so it was left out.
- **Touch targets**: every control is at least 44 × 44 px, also on a phone. A checkbox counts
  by its label: in a table the label is an empty 44px square around the box. Inline links in
  running text are exempt (WCAG 2.5.8). The 390 × 844 and 768 × 1024 checks found no page
  wider than the window.

## Dates

Every date the site shows has one format (decided 2026-10-21), the one "Up next" had: weekday,
day, month, 24-hour time and time zone, in English, e.g. "Thursday 22 October, 20:30 CEST" — the
year only when it is not the current one ("Friday 31 December 2027, 23:00 CET"). A non-breaking
space keeps the zone with its time.

- **One formatter**: `formatDateTime(instant, timeZone, now)` in `shared/localWeek.js`, built
  from the existing `formatDay` and `formatLocal`; in the browser `formatWhen(instant)` from
  `client/src/app/dates.js` (the device's time zone, `deviceZone()`). No date is written with
  the browser's own language (no `toLocaleString` for dates).
- **Where**:
  - the home page's "Up next" and Next call;
  - the Calls page (planned, started, ended);
  - a call's page ("Started …");
  - the prices chart (axis, read-out, "% change since");
  - the admin lists: the audit log, chat sanctions ("until …"), shared copies of reported
    private messages, info pages' last change.
- **Unchanged**: time-only stamps (chat messages, the Community box: "17:00"), and the events
  page, whose day headings ("Monday 19 October") and times already are this format split into
  a heading and a column (with the UTC time in brackets).
- `client/src/calls/callsPage.test.jsx` checks the Calls page under a German browser locale.

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
   "SEASONAL / ENTERTAINMENT" wordmark; nav items as pills with stroke icons (Home, Start here
   (2026-10-23, a flag), Games, Events, Chat, Calls, Seasonal Tokens = the info
   section; Calls only when calls are set up, admins always, with a red LIVE badge while a call
   is live, docs/CALLS.md); a
   divider and the staff items (`staffNavFor` in `navigation.js`): Admin for admins, Site banner
   for organisers, and Manage events (a calendar with a pencil) for both while the event bot's
   admin page is set up (docs/BOTS.md); at the bottom
   the account card (initial, name, role, linking to /account) or, for guests, "Log in" and
   "Register", with the theme toggle; then the legal links (Imprint, Privacy, and "Not
   financial advice" to the Disclaimer, wrapping onto a line of its own; the phone menu shows
   the same footer). The current item
   is the solid pill (`--color-solid`, bold, `aria-current="page"`). Games, Events, Chat and
   Calls end in a 10px dot in the colour of their quarter of the logo: Games Spring `#AFB84E`,
   Events Summer `#E06E22`, Chat Autumn `#F9A825`, Calls Winter `#04AAF7` (`dot` in
   `navigation.js`).
2. **Main column**: a column (2026-10-23): first the banners — the **sign-in ended** notice
   (2026-11-12, `SessionEndedNotice.jsx`: "Your sign-in has ended. Please sign in again." with a
   primary **Sign in** link, except on the login page itself, in the site banner's info style,
   `role="alert"`; docs/AUTH.md, "Sessions"), the **update notice**
   (2026-11-01, `UpdateNotice.jsx`: "A new version of this site is available." with a primary
   **Reload** button, in the site banner's info style, `role="status"`, no Dismiss; shown once the
   server reports another commit than the page's build, docs/DEPLOYMENT.md, "Updating"), the
   **site banner** (an admin's
   message for everyone, `SiteBanner.jsx`, docs/SETTINGS.md: plain text, an optional "Read more"
   link to a page of this site, info on `--color-info-surface` with a winter-blue edge or warning on
   `--color-warning-surface` with a red edge (both classes over the shell's `.banner`;
   `client/e2e/siteBanner.spec.js` checks they differ in both themes), "Dismiss" remembered per text
   in this browser), then the 2FA banner and call notices — and below them the routed page. Home
   takes the room left below the banners, so it still fits the window with a banner on. A page
   loaded on first use that cannot be loaded even after the one reload for an update shows, in
   its place, "This part of the page could not be loaded." with **Reload** in the warning style
   (`role="alert"`, `LazyBoundary.jsx`); the sidebar and banners stay.

**Start here** (2026-10-23, `/start`, `StartPage.jsx`): five numbered steps for a newcomer, each a
card with a sentence or two and a button to a page the site has — what Seasonal Tokens are, how
they work, the risks (info pages), the prices and the fair price, then the chat and the next call
(the live or next planned call, else the Calls page) — and the not-financial-advice notice under
them. "Start here" is in the sidebar for everyone, below Home; guests also see "New here? Start
here" on the greeting's line in the home banner (no extra height: home still fits 1280 x 720).
The "Start here" setting (docs/SETTINGS.md) takes both away; the page stays reachable. The
season clock has a setting of its own.

**"Not financial advice"** (decided 2026-10-23): besides the footer link on every page, a
one-line notice "Information only — not financial advice." with a link to the Disclaimer
(`components/NotAdvice.jsx`, wording in `shared/disclaimer.js`; small and muted, `.not-advice`)
sits where the site is most easily read as advice: above the fair price and the converter on
the prices page, and inside the home fair-price box. That box's title link covers the whole box
(`.home__fair-link`), so the box stays one click target while the notice keeps its own link.

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

**Home** (`LandingPage.jsx`, `homeCards.jsx`; reference `StyleBlocks2.dc.html`). Real data only.
**From 1000px wide, home fits the window without scrolling from 1280 x 720 on** (owner decision
2026-10-17, confirmed 2026-10-21), also at its fullest: a planned call with a long title (in
"Up next" and in Next call), a member's two call buttons, 3 Community messages; and with no
call (no Next call box). **No box is ever cut**, and **nothing a box shows lies under the
floating chat button**. `client/e2e/layout.spec.js` checks all three, in both cases, at
1280 x 720, 1440 x 900 and 1920 x 1080. Below 1000px the page stacks and scrolls.

**The Poll box** (2026-11-10, docs/POLLS.md): while an open poll exists, it takes one column of
the top row and "Up next" the other (it shows only whole entries); its question is clamped at 2
lines and its vote is a dropdown and "Vote" on one line, so the fullest box (a long question,
not anonymous, a call planned) still fits 1280 x 720, 1440 x 900 and 1920 x 1080 with nothing
cut (`layout.spec.js`, "Home with a call and a poll").

To make room (2026-10-21), in this order:

- **a)** a lower banner: 15 % of the window, 96–160px, its lettering scaled with that height
  (the emblem is a share of it), the greeting unchanged;
- **b)** tighter spacing from the tokens: `--space-1` between the boxes, `--space-2` /
  `--space-3` inside them;
- **c)** in Next call, "Add to calendar" and "Remind me on this site" side by side as round icon
  buttons (calendar, bell; their full names as accessible names and tooltips): as text pills the
  two need 289px where the box has 190px at 1280 x 720;
- **d)** the Next call title clamped at 2 lines.

A site call's title in "Up next" stays on one line, the rest an ellipsis (the whole title its
link's text and tooltip; 2026-10-21): wrapped, the long title cut "Up next" at 1280 x 720.

With all four, the top row gets a little more of the height than the bottom one (rows 1.05 :
0.8 : 1.15) for "Up next"'s two pictured events.

The bottom-right box (Fair price) keeps its content left of the chat button: its right padding is
the button's size (`--chat-launcher-size`, also used by `ChatDrawer.css`) plus a gap.

**Shorter and narrower windows** (2026-11-01; a 1500 x 940 window at 125 % display scaling
leaves about 1200 x 650 for the page). Boxes were cut there, so the layout now holds without a
minimum window:

- **No row is lower than its boxes' content** (`minmax(min-content, …fr)`); the featured game's
  label was cut at the top. Its label stays on the first line and the game is centred below it
  with auto margins, which are 0 when it does not fit (nothing cut; 2026-11-04).
  Where even the content does not fit (below 1280 x 720), the main column scrolls; the rows keep
  their proportions above that.
- **"Up next" shows only whole entries** (`useWholeItems.js`): an entry that does not fit is
  hidden and out of reach (`inert`), never shown cut. The list does not make its row taller.
- **The price never runs under the season mark**: the mark has a column of its own, and the
  price's size is the text column's width shared by its characters (container units on the
  tile, its length from `PriceTiles`), so every price fits beside the mark, whatever its digits.
- **The sidebar fits 650px without a scrollbar**: "Imprint", "Privacy" and "Not financial
  advice" share one line (a small gap between the 44px targets); with the old gap the third
  wrapped onto a second line. Since "Manage events" joined the staff items (2026-11-02) the
  menu is tighter as well, so the fullest menu (Admin or Site banner, and Manage events) fits
  609px of height: the owner's 1915 x 913 window at 150 % browser zoom leaves 1277 x 609 CSS
  pixels, where it was 31px too tall and the scrollbar pushed "Not financial advice" out of
  sight. 8px between nav, account card and legal links (was 16px), 2px between the pills (was
  4px; they keep their 44px), 8px above the logo (was 16px), none between the logo bar and the
  first pill (was 8px), 8px at the bottom (was 16px), 4px around the divider (was 8px) and 8px
  above the account card (was 16px): about 9px to spare there. Since "Polls" joined the main
  items (2026-11-10) the pills are 40px tall instead of 44px in a window under 660px high
  (`sidebar.css`), which gives back the 40px the new pill takes; 40px stays well above the 24px
  minimum target. A shorter window or a larger zoom scrolls the menu again (nothing is lost, it
  scrolls).
- **A narrow Fair price box** (one column of a 1280px window, beside Next call) drops its four
  marks and takes the title on one line; its text wrapped so far that the Disclaimer link was
  cut.

`client/e2e/layout.spec.js` checks this at 1200 x 650, 1366 x 768 and 1500 x 940 (no box cut, no
price under its mark, the admin's sidebar without a scrollbar), with the widest prices on the
tiles in every home test, and the full staff menu with Manage events set up, for an admin and
for an organiser, light and dark, without a scrollbar, also at 1915 x 913, 1920 x 1080,
1680 x 900, 2560 x 1080 and 1277 x 609 (150 % zoom).

1. **Banner**: night blue (`--banner-background`) with the faint season pattern
   (`client/src/brand/seasonPattern.css`), the emblem, "SEASONAL" in the logo's gradient
   lettering, "ENTERTAINMENT" in white, and the greeting as the page's `h1` (with the username
   when signed in). Its height follows the window (15 % of it, 96–160px). In its free space on the
   right, the **season clock** (2026-10-23, `SeasonClock.jsx`, `shared/seasonClock.js`): the token
   in season (the highest reward now; its icon on a white disc ringed in its season colour), "Next
   halving: <token>, <date>" by the day only (`formatDate`, never a time), and the small line
   "Calculated from the token contracts' halving schedule." On a phone the banner wraps and the
   clock takes a line of its own.
2. **Featured game** (a "Coming soon" badge only when its status says so) and **Up next** side
   by side. The Featured game box rotates (decided 2026-11-04; docs/OPEN-ROUNDS.md): the games
   with an open sign-up first, by their soonest round, then the others in the games page's order,
   each 8 seconds, also when none has an open sign-up; one game does not rotate and shows no
   controls. A game with an open sign-up shows "Sign-up open", the soonest round's title, its
   start in the site's date format, players / max players and "+N more" in one line. The box is
   compact so the page still fits its window with the longest name and round title (2026-11-04,
   checked at 1280 x 720, 1366 x 768, 1920 x 937 and 1277 x 609): the name, the description and
   the round line one line each, cut with "…" and whole in their tooltip. "All games" (to the
   games page) is always at its top right, on the line of "Featured game", and "All events" in
   Up next the same way: one link style (`.home__card-more`), side by side on one line whatever
   the boxes hold, without adding height (2026-11-04; `client/e2e/layout.spec.js` checks it).
   The eyebrow stays on that first line; the game is centred in the space below it. One row below holds
   "Join" (the primary button, the round's page on the game's site) and "Play" beside it (then
   the secondary one; its tooltip and accessible name "Play <game>"), and the controls at the
   row's end while they fit, else on the line below: previous and next, one dot per game and a
   pause button, each a 44px target with a tooltip. It holds while the mouse is over it, while it
   has keyboard focus, after a tap until a tap outside, and while paused. The focus a mouse click
   or tap leaves on a control does not hold it (2026-11-04: it stopped the box for good after a
   click on next); a key pressed inside makes it keyboard focus again. With reduced motion
   (Windows: Settings → Accessibility → Visual effects → "Animation effects" off) it never moves
   by itself (no pause button then). The changing slide is not announced (`aria-live="off"`). The page asks for the
   games every minute (`client/src/games/featuredRotation.js`, `OpenRoundHint.jsx`). Up next (2026-10-21): the next two of the
   event bot's occurrences and the site's live and planned calls together, by start time
   (docs/CALLS.md, "In the event lists"). A bot event shows a dot in the season colours in turn,
   or its own image; a call shows the calls quarter, its title linking to its page, and its
   date, or "Live now".
3. The **four season price tiles in one row**: each in its solid token colour with dark text,
   the name, the price large (at most the size that fits beside the mark), the 24-hour change;
   the season mark 48px in a white 62px circle at the bottom right, in a column of its own. With prices each tile opens its coin's chart (`/info/prices?coins=<id>`).
4. The bottom row (2026-10-21, `homeBottomRow.css`):
   - **Community** (two columns, night blue; `CommunityCard.jsx`): "● N online" in the Spring
     colour and the newest 3 messages of General, live (docs/CHAT.md, "Community box"); only
     the count and "Open the chat" when the newest message is over a day old.
   - **Next call** (one column; `NextCallCard.jsx`): a live call ("Live now", Listen), else the
     next planned one (title wrapped, never cut with an ellipsis before 2 lines, then clamped,
     the full title the link's name and tooltip, the link a `--hit-target` tap target however
     short the title, without moving anything; its date in the site's one format; "Add to
     calendar", and "Remind me" for members, as icon buttons). **Only when a call is live or
     planned** (2026-10-21): with none, or while calls are not set up, the box is not shown and
     Fair price takes its column.
   - **Fair price & charts** (one column; to `/info/prices`; without the price bot a plain note
     and the link to the info section): the four marks in one row (not in a narrow box), the
     arrow beside the title's last word.

   The bottom row holds the most text.

Faint logo images behind the boxes (`--wash-home`): Featured the controller quarter, Up next the
balls quarter, Community the people quarter, Next call the play button, Fair price the emblem.
Below 1000px the boxes stack two columns wide (tiles two by two) and the main column scrolls.

**Sub pages** (`client/src/brand/PageHeader.jsx`; reference `StyleSubpages.dc.html`): the header
has the section's quarter (64 × 56px) beside the title and a one-line lead, and the same quarter
lies large and faint (`--wash-page`) at the window's bottom right, behind the content. Games:
the controller; Events: the balls; Chat: the people; Calls: the play button.

- **Games**: larger cards with a 200px image band in the season colours in turn, the status as
  a pill above the name. A season image never sits on its own season's colour (the band takes the
  next season in the turn: winter, spring, summer, autumn); the Seasonal Tokens logo, which holds
  all four, sits on the neutral surface (`--color-surface-2`) so every quarter stays visible
  (`client/src/games/gameBand.js`, decided 2026-11-04).
- **Events**: each day a card; each event has a bar in the season colours in turn beside its
  time.
- **Calls**: an empty list shows a card in the page's style instead of "None." ("No call is
  live right now", "No call is planned yet", "No calls yet"); a planned call has "Add to
  calendar" and, for members, "Remind me on this site" as secondary pills.
- **Call notices** (members' reminders, docs/CALLS.md): at the top of the main column in the
  shell's banner style, the text with **Listen** (primary) and **Dismiss** (secondary).
- **Chat page**: the full chat fills the main column as one card, rooms on its left; only the
  message list scrolls and the composer stays at the bottom.

**Prices page** (`/info/prices`): the wide column like Games and Calls (2026-10-21), the title on
a smaller night-blue banner with the season pattern and the four season marks on white discs;
the coin cards wrap in rows; from 1100px the fair price table and the converter stand side by
side — the table's column at least as wide as the table, the converter taking the rest — below
that stacked. Every table cell stays on one line, so all rows have the same height; narrower, the
table scrolls inside its section, never the page.

**Member profile** (`/members/<name>`, `client/src/profiles/`, 2026-11-11; docs/AUTH.md,
"Member profiles"): a page like the account page. At its head the round picture (7rem, cover
fit; without one the name's first letter on the second surface, as a call's speaker tile shows
it) beside the name (h1), the role (Admin, Organiser) and "Member since" in muted text; picture
and name wrap onto two lines where the width is too narrow for both. Below: the Discord steps
with their names, "About me" (its own line breaks kept, long words broken, never a link) or
"Nothing here yet." in muted text, and the buttons in one wrapping row ("Send message"
primary; "Edit my profile", and for admins "Clear About me" and "Remove picture", secondary).
On the account page the "Profile" section has About me with a "n / 300 characters" hint, and the
picture (5rem, round) with "Choose a picture" and "Remove picture". In a call a member's name
links to the profile with a thin underline in the text's own colour. Checked at 360 and 390 px
(`client/e2e/profiles.spec.js`).

**Account page** (`client/src/pages/AccountPage.jsx`, decided 2026-11-13): short and easy to
scan; only the arrangement changed, every setting, form and text inside the sections stays.

- **Fits a desktop window with every section closed** (owner decision 2026-11-13), the home
  page's yardstick: from 1000px wide, with the chat drawer closed, no vertical scrollbar at
  1280 x 720, 1440 x 900, 1915 x 913 and 1920 x 1080, light and dark, for a member and for an
  admin (`client/e2e/accountDesktop.spec.js`). From 1000px the page tightens its own spacing,
  text sizes unchanged: a closed heading's status stands beside its title (under it when too
  long), the rows are slimmer (0.75rem above and below, still 44px targets), and "Delete my
  account" is set apart by 1.5rem. Below 1000px it scrolls as before. Opened sections may make
  it scroll.
- **Summary** at the top, on a card: username, role (as the sidebar's account card shows it,
  "Member": `roleName`, `AccountCard.jsx`) and email ("none (signed up with Discord)"
  for an account made with Discord), with "Log out" (secondary) right after them; below them
  where the width is too narrow. Not pushed to the card's far edge, where the open chat drawer
  would cover it.
- **Six collapsible sections**, all closed by default, in this order: Profile; Sign-in &
  security (the password change or "Set a password", two-factor authentication, Discord, each
  an h3: `AccountSecurity.jsx`); Private messages; Privacy; Notifications (with the push
  switch); Delete my account, set apart below the others.
- **The disclosure** (`client/src/components/Disclosure.jsx`, reusable): one row per section
  between hairlines; the whole heading row is a real button (`aria-expanded`,
  `aria-controls`, at least 44px tall, the global focus ring) with the title (1.25rem) and the
  chevron, which turns while open (at once under reduced motion). A closed panel stays mounted
  but hidden, so its forms keep what was typed and load as before.
- **Status line** under a closed heading's title (beside it from 1000px), in muted text, only
  from what the page already has (never a new request), and no line where it is not known:
  - Profile: "Picture set" / "No picture";
  - Sign-in & security: "Two-factor on" / "Two-factor off" (or "No password yet"), and while
    Discord login is set up "Discord linked" / "Discord not linked";
  - Private messages: "Unlocked on this device" / "Locked on this device" / "Not set up yet";
  - Privacy: "Online status shown/hidden · link previews on/off";
  - Notifications: "Push on this device: on/off", once the browser has said.
- **Open sections**: several at once. The member's own opening and closing is remembered in this
  browser (`se.accountSections`, `client/src/components/useOpenSections.js`; blocked storage
  only means nothing is remembered).
- **Links and notices** open their section from the first render, not remembered:
  - every section's anchor (`#profile`, `#sign-in`, `#private-messages`, `#privacy`,
    `#notifications`, `#delete-account`) and the parts of Sign-in & security (`#password`,
    `#two-factor`, `#discord`), also a link followed while on the page (the 2FA banner's), and
    scrolled into view; a malformed anchor (`#%`) is ignored, the page shows with every section
    as remembered (2026-11-13);
  - a login on the way keeps the anchor and any `?query` (`RequireUser`), and Discord brings
    the member back to `#discord`;
  - a notice waiting in a section opens it: two-factor the site requires but is off, a Discord
    login's answer (`?discord=`) or a link that needs a Discord login again (Sign-in &
    security), a push failure kept for the page (Notifications).
- Checked at 360 and 390 px, light and dark, all closed and all open
  (`client/e2e/accountNarrow.spec.js`); the arrangement in
  `client/src/pages/accountSections.test.jsx`.

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
- **A button showing only an icon has a tooltip** (`title`, decided 2026-11-03) saying, short and
  in English, what a click does in its current state; its accessible name and `aria-pressed` stay
  as they are. Shared where possible: `ToggleButton` (`hints`: "Add General to favourites" /
  "Remove General from favourites", "Turn off notifications for General" / "Turn on
  notifications for General"), `IconButton` (`client/src/app/IconButton.jsx`: one label for name
  and tooltip; the drawer's close, the menu's open, close and rail, the theme), `MenuButton`'s
  "…" (its `buttonLabel`), the composer's buttons only in the compact chat where their texts are
  hidden (`client/src/chat/ChatButton.jsx`); the call controls keep their own `data-tooltip`. A
  button with visible text gets none.

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
  button only. Other pages have the normal sidebar. Every call page starts with the rail
  collapsed, also after the last one was left through a link in the expanded rail (fixed
  2026-11-09).
- **Stage**: on the surface-2 colour with the card radius. Fitting pictures (2026-10-18,
  SE-CALLS-4): shared screens are always letterboxed (`object-fit: contain`), never cropped; a
  camera shown large — alone on the stage or in the spotlight — is letterboxed too; in the grid of
  several speakers every picture takes its camera's aspect ratio (16:9 until the call service
  reports the real one) and fills it (`cover`), so at most a thin edge is cut — never more than
  about 10% of either side (`client/e2e/callFit.spec.js`). A video always fills its picture box
  exactly (positioned over it), so the box's shape decides and the fit does what it says; sized by
  its own height, a video was clipped at the bottom instead (the cut-off faces of the eye test).
  Speaker tiles: picture, name, Host or Speaker, microphone state (off: red), an accent ring while
  talking, organisers' "…" menu. Chips over the top left (pill, surface colour, raised shadow); the
  round full-screen button top right.
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
opens above the row. The full chat page keeps its labelled text buttons; below 600px they wrap
onto more lines instead of overlapping, the picker on a line of its own so it opens as wide as
the composer (2026-11-11). The whole composer stays inside the chat card: its room comes from the
message list above, which keeps at least 8rem; a window too short for that scrolls the page,
and the card grows with it. `client/e2e/composerNarrow.spec.js` checks a room's composer (with
the Poll button) and a direct message's at 360 x 740, 390 x 844 and 375 x 548, light and dark.

## Chat drawer

On every page except `/chat`, `/admin/*` and `/manage-events` (the event bot's page would sit
under the button; `client/src/app/ChatDrawer.jsx`):

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
