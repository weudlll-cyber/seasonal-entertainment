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

## Decided by the owner (2026-11-28, after the first look)

Yes to all seven proposals; everything above the new heights is as before.

1. Private messages under 120 px: chosen in the picker, they offer the chat page in a new tab.
2. The low chat has no scrolling, menus (so no Report or moderation there), links, emojis,
   stickers or GIFs, attachments or polls; the guest note is only read out.
3. One-line messages with an ellipsis (whole in the tooltip).
4. Guests get the rooms only in the picker.
5. A guest on an approved other site keeps the "Log in" line.
6. The call row keeps Leave and "Open the call page".
7. Games hide the shared-call slot until the call is live; the site is unchanged.

## Follow-ups after the first look

- **Focus ring** (`7fc9bce`): it was cut at the frame's bottom edge. In the low panel it is now
  drawn inside the control; no size changed. Browser test at 16 and 32 px, 267 and 931 px wide.
- **"Open the chat page"** (`be03f6e`): an icon in the input's row, 28 px wide, 24 px beside the
  messages, opens the shown room's chat page in a new tab, for members and guests. To make room
  there, the picker beside the messages is 32 px (was 44) and the composer at least 164 px (was
  150). At 32 px in a 267 px frame the input is then about 58 px wide.
- Chosen at a fork: in the private-messages view the existing text link stays (to the chat page),
  and the icon is not repeated.

## Open

- The owner's second look; after the yes, merge #92.
- The kit and the games: nothing to change for the low forms; they size the frames.

## Checks

- Between pieces: lint of the touched folders, the client unit tests of `src/embed` (and
  `src/chat` for piece 1), the build. No typecheck exists in this repository.
- New unit tests seen red against deliberate breaks: 5 (chat), 3 and one form test (call).
- One browser round at the end: `embedLow`, `callEmbed`, `callShared`, `embed`, `embedForeign`.
  One full run: the draft PR's CI.
- Follow-ups: lint and the unit tests of `src/embed` and `src/chat` after each piece, then
  `embedLow` alone (4 tests, passed). The two new browser tests seen red with the ring outside
  the input and without the link; the two new unit tests without the link.

## Line counts (before → after, against `master`)

| File                                                          | Lines          |
| ------------------------------------------------------------- | -------------- |
| `client/src/chat/ChatLow.css`                                 | new 167        |
| `client/src/chat/LowMessageList.jsx`                          | new 66         |
| `client/src/chat/staffBadges.js`                              | new 10         |
| `client/src/chat/ChatPanel.jsx`                               | 130 → 152      |
| `client/src/chat/ChatComposer.jsx`                            | 126 → 129      |
| `client/src/chat/ChatMessage.jsx`                             | 84 → 81        |
| `client/src/chat/RoomPanel.jsx`                               | 48 → 48        |
| `client/src/embed/ChannelPicker.jsx`                          | new 48         |
| `client/src/embed/ChatPageLink.jsx`                           | new 27         |
| `client/src/embed/useLowFrame.js`                             | new 26         |
| `client/src/embed/EmbedChatPage.jsx`                          | 160 → 195      |
| `client/src/embed/EmbedChat.css`                              | 46 → 130       |
| `client/src/embed/EmbedCallView.jsx`                          | 213 → 236      |
| `client/src/embed/EmbedCall.css`                              | 201 → 239      |
| `client/src/embed/callView.js`                                | 64 → 66        |
| `client/src/embed/callView.test.js`                           | 100 → 108      |
| `client/src/embed/embedCall.test.jsx`                         | 268 → 271      |
| `client/src/embed/embedChatLow.test.jsx`                      | new 208        |
| `client/src/embed/embedCallLow.test.jsx`                      | new 98         |
| `client/src/devPages/StripTestPage.jsx`                       | new 108        |
| `client/src/devPages/GameCallTestPage.jsx`                    | 148 → 150      |
| `client/src/app/App.jsx`                                      | 244 → 257      |
| `client/e2e/embedLow.spec.js`                                 | new 274        |
| `client/e2e/frames.js`                                        | 34 → 37        |
| `client/e2e/embeddedCall.js`                                  | 60 → 62        |
| `client/e2e/members.js`                                       | 146 → 147      |
| docs (`ARCHITECTURE`, `BACKLOG`, `EMBED`, `GAME-INTEGRATION`) | +50 together   |
| `package.json`, `package-lock.json`                           | +12 (axe-core) |

Removed: the staff badge table from `ChatMessage.jsx`. Noticed and left: the "Phone strip" size
of `/games/call-test` shows the low row in a wide window, since the form follows the game's
window.
