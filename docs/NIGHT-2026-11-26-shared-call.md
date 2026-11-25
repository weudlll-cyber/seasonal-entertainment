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
- **Piece 3, the shared view:** `/embed/call/shared` (`EmbedSharedCallPage.jsx`, reusing the
  per-call view). Measured first: a hidden view already receives no video (0 KB, N=5), so nothing
  was changed for `visible`. 7 tests, all seen red once; the 52 embed tests pass.

- **Piece 4, in the call already:** `shared: true` joins answer 409 `in_call_elsewhere`; the
  shared view shows the note, asks every 5 s and on the call page's leave message; a playing
  view dropped by a call-page join waits the same way. Server and client tests seen red once;
  the 160 tests of `client/src/embed` and `client/src/calls` pass.

- **Piece 5, the call page:** the "Share with the games" switch on the call's card and page
  and in the New call form, the replace question, "Shared with the games", and "Frame the
  shared call" on the call-test page. 5 new tests seen red once; `client/src/calls`, `embed`
  and `pages`: 317 tests, the one stale expectation fixed.

- **Piece 6, docs and the browser spec:** `client/e2e/callShared.spec.js` (runs in CI only;
  not seen red, since it was not to be run locally), the call-view helpers moved to
  `client/e2e/embeddedCall.js`, docs. The BACKLOG entry stays in part one until the merge (its
  own rule); there is no `OPEN.md` in this repository.

## Running

- CI on the PR.

## Open

- Nothing else.

## Needs the owner

- To confirm (chosen as the contract of section 9 reads): a **scheduled** call that is shared is
  published too, with `ready { status: 'scheduled' }`; the 2026-11-24 wording speaks of a live
  one. A game that wants live only can wait for `status: 'live'`.
- To decide: switching from the call page to a game in the same tab still takes one **Listen**
  click; the view does not connect by itself when it loads (the concept note proposed it, none
  of the pieces asks for it).
- To decide: the view of one named call (`/embed/call/<id>`) and a guest with two tabs still
  drop the other connection (the pieces cover members and the shared view).
- There is no form that edits a call: "the edit form" is the call's card and page, where the
  switch is.
- Noticed: `server/test/botImages.test.js` ("over 50 megapixels") timed out after 60 s once in
  a full local server run on this loaded PC (931 other tests passed), and passed in the next,
  targeted run. Not touched by this branch.
