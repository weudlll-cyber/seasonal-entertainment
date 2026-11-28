<!--
File:        NIGHT-2026-11-28-embed-low.md
Path:        docs/NIGHT-2026-11-28-embed-low.md
Project:     Seasonal Entertainment
Description: The report sheet of the task "a low layout for the embedded chat and call", branch
             feat/embed-low (draft PR #92): done, open, what needs the owner, the choices made at
             forks, and the line counts. A later session resumes from here.
-->

# 2026-11-28: the low chat and call for the 100 px docked strip

Branch `feat/embed-low` from `master` (`f8f2cdf`), draft PR #92. **Not merged: the owner looks
first.** Nothing goes to the server.

## Done

- **Piece 1, chat** (`26211f8`): in a frame under 120 px, the newest two or three messages, one
  line each, and one row with a channel picker, the input and Send. At a 32 px font the messages
  stand beside the input.
- **Piece 2, call** (`02b9b84`): in a desktop frame wider than high and under 96 px, one row
  without Expand. The phone's strip is unchanged. A flaky test of the call view
  ("says ready, connects only on Listen") is fixed at its cause (`BACKLOG.md`, part two).
- **Piece 3, guide** (`cf81def`): the shared call shows only while it is live.
- **Test page and browser spec:** `/games/strip-test/` (development only) and
  `client/e2e/embedLow.spec.js`: 267 × 90 and 267 × 94, a signed-in test member, 16 and 32 px,
  input and two messages whole, picker by keyboard, no scroll in either frame, axe-core WCAG
  2.2 AA clean. Seen red with the side-by-side layout removed, and with the low call form
  removed.
- **Reused:** `useChatRooms`, `useUnread`, `UnreadCount` (picker); `ViewButton`, `OpenCallPage`,
  `onPhone`, `formOf` (call); `memberPage`, `frameOf` and `frameView` (both given a box size),
  `mockApi`, `fakeLiveKit` (tests). The staff badge names moved to `chat/staffBadges.js`.
- **New dependency:** `axe-core` 4.14.1 (development only, MPL-2.0), pinned.

## Open

- The kit and the games: nothing to change for the low forms; they size the frames.

## Needs the owner's word

Each is a choice made without asking; above the new heights everything is as before.

1. **Private messages** under 120 px: the picker lists them, and choosing them shows only the
   picker and "Open the chat page" (a new tab). The conversations have no room in 90 px.
2. **What a low frame leaves out:** older messages (no scrolling), links, name menus, the "…"
   menu (Report and the moderators' actions), emojis, stickers and GIFs, "Attach file", "Poll",
   the guest note (still read out).
3. **"Whole" messages:** each is one whole line, long text ends in an ellipsis (whole in the
   tooltip). At 32 px in a 267 px frame the line beside the input is short and cut early.
4. **Picker:** guests get it too (rooms only). It is 44 px high, 88 px wide, 44 px beside the
   messages.
5. **A guest on an approved other site** keeps the account line with "Log in" in a low frame.
6. **Call row:** it also has Leave (while listening) and "Open the call page". A frame narrower
   than high still shows the 48 px column.
7. **Scheduled shared calls:** only the guide changed. The site still sends `ready` with
   `scheduled`, and the game hides the slot until `live`. To say if the site itself should send
   nothing before the start.

## Checks

- Between pieces: lint of the touched folders, the client unit tests of `src/embed` (and
  `src/chat` for piece 1), the build. No typecheck exists in this repository.
- New unit tests seen red against deliberate breaks: 5 (chat), 3 and one form test (call).
- One browser round at the end: `embedLow`, `callEmbed`, `callShared`, `embed`, `embedForeign`.
  One full run: the draft PR's CI.

## Line counts (before → after, against `master`)

| File                                                          | Lines          |
| ------------------------------------------------------------- | -------------- |
| `client/src/chat/ChatLow.css`                                 | new 159        |
| `client/src/chat/LowMessageList.jsx`                          | new 66         |
| `client/src/chat/staffBadges.js`                              | new 10         |
| `client/src/chat/ChatPanel.jsx`                               | 130 → 152      |
| `client/src/chat/ChatComposer.jsx`                            | 126 → 129      |
| `client/src/chat/ChatMessage.jsx`                             | 84 → 81        |
| `client/src/chat/RoomPanel.jsx`                               | 48 → 48        |
| `client/src/embed/ChannelPicker.jsx`                          | new 48         |
| `client/src/embed/useLowFrame.js`                             | new 26         |
| `client/src/embed/EmbedChatPage.jsx`                          | 160 → 187      |
| `client/src/embed/EmbedChat.css`                              | 46 → 113       |
| `client/src/embed/EmbedCallView.jsx`                          | 213 → 236      |
| `client/src/embed/EmbedCall.css`                              | 201 → 239      |
| `client/src/embed/callView.js`                                | 64 → 66        |
| `client/src/embed/callView.test.js`                           | 100 → 108      |
| `client/src/embed/embedCall.test.jsx`                         | 268 → 271      |
| `client/src/embed/embedChatLow.test.jsx`                      | new 183        |
| `client/src/embed/embedCallLow.test.jsx`                      | new 98         |
| `client/src/devPages/StripTestPage.jsx`                       | new 108        |
| `client/src/devPages/GameCallTestPage.jsx`                    | 148 → 150      |
| `client/src/app/App.jsx`                                      | 244 → 257      |
| `client/e2e/embedLow.spec.js`                                 | new 185        |
| `client/e2e/frames.js`                                        | 34 → 37        |
| `client/e2e/embeddedCall.js`                                  | 60 → 62        |
| `client/e2e/members.js`                                       | 146 → 147      |
| docs (`ARCHITECTURE`, `BACKLOG`, `EMBED`, `GAME-INTEGRATION`) | +43 together   |
| `package.json`, `package-lock.json`                           | +12 (axe-core) |

Removed: the staff badge table from `ChatMessage.jsx`. Noticed and left: the "Phone strip" size
of `/games/call-test` shows the low row in a wide window, since the form follows the game's
window.
