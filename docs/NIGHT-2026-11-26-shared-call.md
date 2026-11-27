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

- **CI:** the workflows were green at `963be59` (`npm run verify` with 935 server tests, 759
  client tests and 206 browser tests, `callShared.spec.js` among them).
- **Correction (2026-11-27):** this sheet first said "all checks green at `963be59`", which did
  not hold for CodeQL. Its alert `js/missing-token-validation` is a false positive: `csrfGuard`
  (`server/src/http/csrf.js`) is mounted at `server/src/app.js:134`, before the session
  middleware and every `/api` route. The owner dismissed the alert on 2026-11-27.
- **After the owner's look (2026-11-27):** the note of piece 4 reads "You're in this call in
  another tab or on another device. The call plays there."; #90 is to be merged once its checks
  are green.

## Running

- Nothing. The chain is finished.

## Open

- The games' side of the shared call (`BACKLOG.md`, part one).

## For the owner to look at

The dev server runs this branch (LiveKit on 7880, the site on http://localhost:5380; the dev
admin's sign-in is in `data/DEV-ADMIN.txt`).

1. http://localhost:5380/calls — sign in as the dev admin, fill in **New call**, tick **Share
   with the games**, **Start call now**. The call's page has the switch in its header.
2. http://localhost:5380/games/call-test/?call=shared — the shared view as a game frames it.
   With the call page open in another tab and joined, **Listen** there shows the note; **Leave
   call** starts the sound.

## Proposals only (not decided, not built)

- A "Games with sign-up open" list on the call page (the concept note, section 5).

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
