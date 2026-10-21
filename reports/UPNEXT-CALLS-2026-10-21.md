# SE-UPNEXT-CALLS-1 — "Up next" lists site calls too (2026-10-21)

Branch `feat/se-upnext-calls-1`, not merged: the owner looks first. Owner request 2026-10-21.

## What changed

- **"Up next" (home) and `/events`** show the event bot's occurrences and the site's live and
  planned calls together, by start time (docs/CALLS.md, "In the event lists").
  - **One source**: both read the Calls page's own `GET /api/calls` answer through
    `client/src/calls/useCalls.js`, which also feeds the Next call box. A viewer sees exactly
    the calls the Calls page shows them. Ended calls are never listed.
  - **A call entry**: the title linking to `/calls/<id>`, its date in the site's format
    (`formatWhen`, `client/src/app/dates.js`) or "Live now", and the calls quarter
    (`/brand/quarter-calls.webp`) as its picture.
  - **Order**: `client/src/calls/callEntries.js` turns the answer into dated entries; they are
    merged with the bot's and sorted by start (`byStart`). A live call is placed at its start. A
    planned call without a time has no place in a list by time; the Calls page and the Next call
    box still show it.
  - **Home** keeps 2 entries over its seven days. A planned call whose time has passed but that
    has not started comes first, as the Calls page still lists it as upcoming.
  - **`/events`** lists every call of the week on screen (`CallEventItem.jsx`, laid out as the
    bot's entries).
  - **Bot events** are unchanged: data, links and images. Without calls set up, both lists show
    the bot's events only.
- **Next call box**: shown only when a call is live or planned. Otherwise it is not rendered and
  the fair-price box takes its column, with the existing rule for "calls not set up". The box's
  "No call is planned yet" line and its "All calls" link could no longer be reached and are
  removed.
- **Window fit**: with the 58-character test title, "Up next" was cut at 1280 x 720 (the title
  wrapped). A call's title in "Up next" now stays on one line with an ellipsis; the whole title
  stays the link's text and is its tooltip. No text got smaller.

## Tests (each seen red once with the old behaviour put back)

| Test                                                                                                | Red when                                                    |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `LandingPage.test.jsx` "Up next merges the site's planned call with the bot's events in time order" | the calls left out of "Up next"                             |
| `LandingPage.test.jsx` "a guest sees just the live and planned calls of the Calls page's answer"    | the calls left out; and, separately, ended calls listed too |
| `LandingPage.test.jsx` "the Next call box only with a live or planned call"                         | the box always rendered                                     |
| `homeLive.test.jsx` "nothing live or planned: no box at all"                                        | the box always rendered                                     |
| `eventsPage.test.jsx` "shows the site's planned call among the bot's events, in time order"         | the calls left out of `/events`                             |
| `layout.spec.js` "Home without a call: no Next call box, still fits…" (3 sizes)                     | the old box (all 3 sizes)                                   |
| `layout.spec.js` "Home with a call fits without scrolling…" (3 sizes)                               | the call title wrapping in "Up next" (1280 x 720)           |

Also: "calls not set up: Up next shows the bot's events only, and no Next call box". The
existing events tests now render inside the session and router and answer `GET /calls`.

`npm run verify` passed (lint, format, shared, server, client, build, 101 browser tests). The
browser tests' dev proxy ran on port 5391 (`SE_E2E_DEV_PROXY_PORT`): a process outside this
repository answered on 5390.

## Screenshots (`reports/upnext-calls/`)

| File                               | What                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 01-home-call-1440-light.png        | Home at 1440 x 900, light, a planned site call: in "Up next" among the bot's events (calls quarter, its date) and in the Next call box       |
| 01-home-call-1440-dark.png         | The same, dark                                                                                                                               |
| 02-home-no-call-1440-light.png     | Home at 1440 x 900, light, no live or planned call: no Next call box, the fair-price box two columns wide                                    |
| 02-home-no-call-1440-dark.png      | The same, dark                                                                                                                               |
| 03-home-call-1280x720-light.png    | Home at 1280 x 720, light, the planned call in "Up next" and the Next call box: fits without scrolling                                       |
| 04-home-no-call-1280x720-light.png | Home at 1280 x 720, light, no call: fits without scrolling, fair price two columns wide                                                      |
| 05-events-call-1440-light.png      | Events page at 1440 x 900, light, at the call's day: the site call among the bot's events in time order, with the calls quarter and its date |
| 05-events-call-1440-dark.png       | The same, dark                                                                                                                               |

## Temporary data — removed

- The dev admin planned one call for the screenshots ("Community call: the autumn season").
  Afterwards it was ended, then deleted with its chat room (no messages, no reminders). The dev
  database again holds only the owner's ended "Testall" call.
- The tests and browser tests create no data of their own for this.

## Lines before → after

| File                                    | Lines     |
| --------------------------------------- | --------- |
| `client/src/calls/useCalls.js`          | new, 26   |
| `client/src/calls/callEntries.js`       | new, 24   |
| `client/src/pages/CallEventItem.jsx`    | new, 35   |
| `client/src/pages/LandingPage.jsx`      | 99 → 113  |
| `client/src/pages/homeCards.jsx`        | 163 → 193 |
| `client/src/pages/NextCallCard.jsx`     | 69 → 64   |
| `client/src/pages/EventsPage.jsx`       | 86 → 101  |
| `client/src/pages/LandingPage.css`      | 288 → 296 |
| `client/src/pages/homeBottomRow.css`    | 159 → 161 |
| `client/src/pages/LandingPage.test.jsx` | 148 → 226 |
| `client/src/pages/homeLive.test.jsx`    | 173 → 172 |
| `client/src/pages/eventsPage.test.jsx`  | 125 → 166 |
| `client/e2e/layout.spec.js`             | 226 → 243 |
| `docs/DESIGN.md`                        | 359 → 366 |
| `docs/CALLS.md`                         | 390 → 404 |
| `docs/BOTS.md`                          | 263 → 268 |
| `docs/ARCHITECTURE.md`                  | 536 → 538 |
| `docs/BACKLOG.md`                       | 308 → 315 |
| `.gitignore`                            | 29 → 30   |

## Fix before the merge (owner review 2026-10-21)

On the events page, a site call's entry showed an empty line between its title and its text,
and the text repeated the date.

- **Text**: the line is now just "Community call on this site" ("Live now" for a live call).
  The day's heading and the time column already carry the date.
- **Empty line**: it had two causes.
  - The bot's own link ("Open …") gets a 44px line, and that rule also caught the call's title
    link. The rule now applies only to links directly in the entry's text
    (`.event__body > a`).
  - The entry's text grid spread its two lines over the height of the taller calls quarter. A
    call's lines now stay together at the top (`.event--call .event__body`). Bot entries are
    unchanged.
- **Test**: `eventsPage.test.jsx` expects the line "Community call on this site", the time in
  the time column, and no repeated date. It went red once with the date put back into the line.

| File                              | What                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 06-events-call-fix-1440-light.png | Events page at 1440 x 900, light, after the fix: the call's title and "Community call on this site" with no empty line between; the date only in the day heading and the time column |

Temporary data: the screenshot's planned call was ended and deleted with its chat room. The
dev database again holds only the ended "Testall" call.

| File                                   | Lines     |
| -------------------------------------- | --------- |
| `client/src/pages/CallEventItem.jsx`   | 35 → 33   |
| `client/src/pages/EventsPage.css`      | 130 → 138 |
| `client/src/pages/eventsPage.test.jsx` | 166 → 167 |
| `docs/CALLS.md`                        | 404 → 406 |
