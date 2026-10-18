# DESIGN.md — the "Arena" look

The site's design direction ("Arena", chosen 2026-10-17): dark-capable, a left sidebar, no
page-level scrolling, and the chat one button away on every page. This file holds the rules;
the values live in `client/src/styles/tokens.css`, the single source of tokens.

## Tokens

Components use custom properties only; no component hard-codes a colour. Light is the default
set on `:root`; `:root[data-theme='dark']` replaces the colours.

| Token                     | Light     | Dark      | Use                                             |
| ------------------------- | --------- | --------- | ----------------------------------------------- |
| `--color-background`      | `#f4f6f9` | `#0b0e13` | behind everything (main column)                 |
| `--color-sidebar`         | `#ffffff` | `#0f131a` | sidebar / top bar                               |
| `--color-surface`         | `#ffffff` | `#151a22` | cards, panels, the chat drawer                  |
| `--color-surface-2`       | `#f1f3f6` | `#1c222c` | inset areas inside a surface                    |
| `--color-active-bg`       | `#eaf6fe` | `#1c2532` | the active navigation item                      |
| `--color-text`            | `#12161c` | `#eef1f5` | body text                                       |
| `--color-text-muted`      | `#56606c` | `#a1aab6` | secondary text                                  |
| `--color-border`          | `#e2e6ec` | `#252c38` | hairlines                                       |
| `--color-border-strong`   | `#b8bec7` | `#4a5466` | field outlines                                  |
| `--color-danger`          | `#b42318` | `#ff8a80` | errors                                          |
| `--color-success`         | `#1d7a46` | `#4acb8a` | confirmations                                   |
| `--color-warning-surface` | `#fff4d6` | `#3a2e10` | the staff 2FA banner                            |
| `--shadow-raised`         | soft      | deeper    | drawers, the chat button                        |
| `--color-on-season`       | `#12161c` | `#12161c` | icons/text on a season colour (9.2:1 on autumn) |
| `--color-live`            | `#b42318` | `#b42318` | the red LIVE badge (calls)                      |
| `--color-on-live`         | `#ffffff` | `#ffffff` | text on the LIVE badge (6.6:1)                  |

Season colours (`--color-spring/summer/autumn/winter`) are the same in both themes. Dark values
were chosen so every text colour keeps WCAG AA (4.5:1) on every surface of its set: lowest pairs
are muted text on the active background (dark 6.57:1) and success on surface-2 (light 4.81:1).

Shape: `--radius` 12px for controls, `--radius-card` 20px for cards, `--hit-target` 44px for the
smallest clickable control.

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

1. **Sidebar**, 232px (`--sidebar-width`): logo with the "SEASONAL / ENTERTAINMENT" wordmark; nav
   items with stroke icons (Home, Games, Events, Chat, Calls, Seasonal Tokens = the info
   section; Calls only when calls are set up, admins always, with a red LIVE badge while a call
   is live, docs/CALLS.md); a
   divider and Admin for admins only (as before; `staffNavFor` in `navigation.js`); at the bottom
   the account card (initial, name, role, linking to /account) or, for guests, "Log in" and
   "Register", with the theme toggle; then the legal links (Imprint, Privacy). The active item
   has the active background, bold text and `aria-current="page"`.
2. **Main column**: the routed page.

**Below 760px**: the sidebar becomes a top bar (logo, theme toggle, menu button). The menu opens
the same navigation as a drawer from the left, over a scrim: closed by its close button, Escape,
the scrim, or following a link; focus moves into it and back to the menu button.

**Pages** sit on the background; their content blocks are cards (`--color-surface`, 20px radius):
forms, admin tables, info text, game cards, event days. Controls have a 12px radius and at least
the 44px hit target; keyboard focus always shows a ring in the accent colour.

**Home** is a bento grid that fits the main column at 1280 x 720 without scrolling: the greeting
(with the username when signed in), the featured game (the first game of the games data, a
"Coming soon" badge only when its status says so), "Up next" with the next two events
(`upcomingOccurrences`, shared), and Seasonal Tokens with the four season marks linking to the
info section. Real data only. Below 1000px the cards stack and the main column scrolls.

**Chat page**: the full chat fills the main column, rooms on its left; only the message list
scrolls and the composer stays at the bottom.

**Room list** (`client/src/chat/RoomTabs.jsx`, layout 2026-10-18): each room is one grid row of
fixed columns — the room name (flexible, one line, cut with an ellipsis; the full name stays in
its text, so in the accessible name, and in its `title`), the unread count (2.75rem), the star
(44px) and the bell (44px). Named grid areas keep a column empty when its part is absent (no
count at 0, no toggles for guests), so every row's star and bell stand at the same x. The column
is 28% of the panel, at least 15rem and at most 18rem: "Announcements" fits beside its count and
toggles, longer names get the ellipsis, and nothing reaches into the message panel. The current
room highlights its whole row with the active background and bold text, as the sidebar does; the
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

**Call page** (`/calls/:id`, design "Community Call – Bühne", docs/CALLS.md): the header across
(title, LIVE badge, start time, how many speak and listen); on the left the stage, the control
bar and the listeners, scrolling inside; on the right (22rem) the call's chat. Below 1000px the
chat opens as a drawer over the page ("Show chat" in the header). The site's chat button is
not shown on a call page. Speaker tiles: camera picture or the name's initial, name, Host or
Speaker, microphone state, an accent ring while talking (a shared screen replaces the camera
picture); at least 12rem per column. The
spotlight shows one speaker large (a shared screen with the camera inset in the corner, and the
label "<name> is sharing the screen" with a sound icon when it carries audio), the others in a
strip. Control buttons are icons with visible labels; on/off in `aria-pressed`. Listeners are
chips (pill shape): an initial circle (winter blue; neutral grey with a person icon for hidden
listeners), the name, a "Guest" tag for guests; raised hands come first, with an autumn-orange
border and hand symbol; organisers get a compact pill "Invite" button inside the chip (drawn
32px, 44px hit area). "Find a listener" uses the site's field look (`.search-input`,
`client/src/styles/forms.css`). The call's chat is the chat module's compact panel, like the
drawer.

**Compact chat composer** (the drawer and a call's chat, `client/src/chat/ChatComposer.css`): one
row — a single-line message field and square 44px icon buttons (emoji/stickers/GIFs, attach,
send); the "Message" heading and the button texts are kept for screen readers only. The picker
opens above the row. The full chat page keeps its labelled text buttons.

## Chat drawer

On every page except `/chat` and `/admin/*` (`client/src/app/ChatDrawer.jsx`):

- A round **chat button** bottom right: 64px, autumn colour, chat icon (`--color-on-season`), with
  the unread dots (blue rooms, orange private messages; docs/CHAT.md, "Unread counters").
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
