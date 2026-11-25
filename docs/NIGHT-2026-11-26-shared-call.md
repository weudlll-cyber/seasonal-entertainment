<!--
File:        NIGHT-2026-11-26-shared-call.md
Path:        docs/NIGHT-2026-11-26-shared-call.md
Project:     Seasonal Entertainment
Description: Morning sheet of the unattended night chain "the call shared with the games"
             (website part), branch feat/shared-call: what is done, running, open, and what
             needs the owner. A later session resumes from here.
-->

# Night 2026-11-26: the call shared with the games

Branch `feat/shared-call` from `master` (`cc743b9`). Draft PR; nothing is merged or tagged.

## Done

- **Piece 1, docs:** the decisions of 2026-11-25 in the BACKLOG and the concept note; the shared
  view's contract in `GAME-INTEGRATION.md`, section 9.
- **Piece 2, server:** `calls.shared_with_games` with a one-shared-call index,
  `PUT /api/calls/:id/shared`, `sharedWithGames` on create, `GET /api/public/shared-call`,
  cleared on end, audited (`CALLS.md`, "Calls on the site"). 9 tests, all seen red once.

## Running

- Piece 3, the shared view.

## Open

- Piece 4, "already in the call" and the sound start.
- Piece 5, the call page.
- Piece 6, docs and the browser spec (the one to drop when short of time).

## Needs the owner

- To confirm (chosen as the contract of section 9 reads): a **scheduled** call that is shared is
  published too, with `ready { status: 'scheduled' }`; the 2026-11-24 wording speaks of a live
  one. A game that wants live only can wait for `status: 'live'`.
- Noticed: `server/test/botImages.test.js` ("over 50 megapixels") timed out after 60 s once in
  a full local server run on this loaded PC (931 other tests passed), and passed in the next,
  targeted run. Not touched by this branch.
