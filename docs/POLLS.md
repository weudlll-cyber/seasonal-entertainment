# Polls

Polls on the site (decided 2026-11-10): organisers and admins ask, signed-in members answer,
everyone sees them. The page is `/polls` ("Polls" in the sidebar, after Calls).

## Rules

- **Who creates**: organisers and admins. **Who votes**: signed-in members, one vote per
  account. Guests see every poll but cannot vote; they get a "Sign in to vote" hint.
- **A poll** is a question (at most 200 characters) and either
  - **fixed answers**: 2 to 10 (each at most 100 characters, all different), one or several may
    be chosen, optionally with an **"Other answer"** text field; or
  - **free text only**.

  A written answer has at most 500 characters. With free text on, the create form warns that
  these answers must be evaluated by hand.

- **Who may vote**, chosen at creation:
  - **All members** (the default).
  - **Discord steps**: a member with one of the chosen steps or a higher one in the same
    ladder votes. This is the chat rooms' step rule (`passesStepRule`,
    `server/src/discord/steps.js`; `room_step_rules`: "in any one ladder, at least one of the
    named steps"), reused unchanged, and organisers and admins always pass. A step poll is
    seen by everyone; a member who may not vote reads "Voting from <steps>". A step deleted
    later leaves the poll; with none left only organisers and admins vote (an empty room rule
    lets everyone in; here it does not).
  - **Organisers and admins only** (a team poll): seen only by them; for everyone else there
    is no such poll (404).
- **Written answers** ("other" and free text) are read only by organisers and admins (listed
  in the results); everyone else sees how many there are.
- **Results**, chosen at creation: **right after your vote** or **after the poll ends**.
  Organisers and admins always see the live results, written answers included. A guest sees
  the results once the poll has ended. Every open poll states its rule to voters ("Results
  after you vote" / "Results after the poll ends"; organisers and admins read that they see
  live results; 2026-11-11). The rule travels as `resultsWhen`; the results stay hidden as
  before.
- **Changing a vote**: only in a poll whose results show after the end, until the end;
  otherwise a vote is final. This holds for **anonymous** polls too (decided 2026-11-11): while
  such a poll is open the site keeps which ballot is whose (`poll_ballot_links`, see "Data"),
  only so the vote can be replaced; the form then starts empty, as the earlier answers are
  never sent back. The card says "You voted. You can change your vote until the poll ends".
- **Anonymous or not**, chosen at creation; organisers and admins can switch it until the
  first vote, then it is fixed.
  - **Anonymous**: nobody, admins included, sees who voted what. Only what keeps it to one
    vote per account is stored.
  - **Not anonymous**: signed-in members who may see the results see the names per answer;
    guests get the counts only, in every answer that carries results (`GET /api/polls`,
    `GET /api/polls/:id` behind a room's poll card, the home box's summary; decided
    2026-11-13). The vote form says "This poll is not anonymous – your name will be shown to
    signed-in members" before anyone votes. The privacy page's "Polls" entry says who sees
    what.
- **End**: a fixed end time or "end by hand". Organisers and admins end a poll early and
  extend it (a later end time, also for one that was to end by hand) while it is open. Ended
  polls stay on the page with their results, after the open ones (the archive). Open and ended
  polls are each listed newest first (2026-11-11). **Only admins
  delete** a poll (with its votes), after a question.
- **Audit**: `poll.create`, `poll.end`, `poll.extend`, `poll.delete` (with the question; an
  extension also with the new end). The anonymous switch is not audited.
- **Deleting an account** removes its votes and written answers in polls that are not
  anonymous, as its chat messages (decided 2026-11-01), and in an anonymous poll whose results
  show after the end while it is still open (through the link). After such a poll has ended, and
  in an anonymous poll with results after the vote, its ballot names nobody and stays
  unattributed; only the mark that it voted goes.

## Polls in a call

- In a **live** call, organisers and admins start a poll from the call page ("Start a poll" in
  its header): the same form and rules, its end in **1, 2 or 5 minutes** or by hand. A poll
  can be started only while the call is live (409 `call_not_live` otherwise).
- It shows **under the stage** (`client/src/calls/CallPolls.jsx`, at most a third of the main
  column, scrolling inside) for everyone on the call page, joined or not, with a **countdown**
  ("1:23 left", `client/src/polls/Countdown.jsx`). The page asks every 10 seconds (guests get no
  live event) and at once on the members' `polls` event. Without a poll and an open form
  nothing is shown, so the stage keeps its height.
- **Ending the call ends its open polls** (`server/src/calls/endCall.js`, `endCallPolls`), also
  when the stale-call job ends it.
- On the Polls page such a poll is marked with its call ("in the call <title>", a link). A
  deleted call leaves the poll there without the link (`ON DELETE SET NULL`).

## Polls in chat rooms

Decided 2026-11-11:

- In a chat **room** (never in direct messages), organisers and admins get a **"Poll"** button
  beside the composer (`client/src/chat/ChatPanel.jsx` passes it to the composer's new
  `actions` slot; the direct conversations use the composer without it). It opens the same
  poll form above the composer; the poll is created with the room (`room`: its slug), in a
  room the creator may write in (403 `room_not_allowed` otherwise). The card is a message, so
  it is checked as one (the chat handle's `polls.refused`, decided 2026-11-13): a creator muted
  or banned in the chat is refused (403 `muted` / `banned`, the chat's own answer), and the card
  counts against their message limit (429 `too_many_messages`). A poll outside any room is not a
  chat matter and goes as before.
- The poll appears as a **card in the room's timeline**: a chat message of its creator whose
  `poll_id` names it (`chat_messages.poll_id`, added by `migratePolls`; the card goes with its
  poll), posted, pushed and counted for unread exactly as a member's post (the chat handle's
  `polls.post`: `addMessage`, the hub's `broadcast` and `notifyReaders`, as `routes.js` and
  `system.post` do). The timeline renders it in `ChatMessage.jsx` (`ChatPollCard`, the same
  `PollCard` as the Polls page, loaded by `GET /api/polls/:id` and kept live by the existing
  `polls` event). Members vote in place.
- **The room's own read rules**: only those who may read the room see its poll, on its card,
  on the Polls page ("in the room <name>"), in the home box and the sidebar's dot, and may vote
  (`canRead(room, chatViewer(req))`, through the chat handle's `polls.readable`; guests too
  where a room lets them read). Otherwise all rules are those of every poll: who may vote,
  anonymity, the results rule, the end, extending, ending early, deleting by admins.
- A deleted poll takes its card along; an open timeline that still shows it says "This poll
  was deleted." A deleted room takes its polls along.
- The chat module imports only documented files from outside (`chatModule.test.js`); the card
  and the form are two of them since 2026-11-11 (docs/CHAT.md).

## On a phone

Every poll view is checked at 390 x 844 and 360 x 740, light and dark (decided 2026-11-11):
no sideways scrolling; under 600px each answer is a full-width line of at least 44px (the whole
line its target), "Vote" / "Change vote" full width, the text fields and the new end as wide as
the card. While a free-text field has focus, the page moves so that the field and its button
stay above the on-screen keyboard (`client/src/polls/aboveKeyboard.js`, following the visual
viewport). A call's poll keeps its countdown at the top of its card. Stacked below 1000px, the
home box takes the full width at the end of the page. `client/e2e/polls.spec.js` votes, changes
a vote and answers in words at both sizes.

## The home page and the sidebar

- **The Poll box** on the home page (`client/src/pages/HomePollCard.jsx`, `homePoll.css`): the
  newest open poll the viewer sees, in the top row beside "Up next", which then takes one column
  (it shows only the entries that fit). The question is clamped at 2 lines. A single-choice poll
  without a written answer is voted right in the box: a dropdown of the answers and "Vote" on
  one line, with "Not anonymous: signed-in members see your name." above when it is not anonymous. A poll
  with several answers or a written answer links to the Polls page ("Vote"): its form would not
  fit the row, and the home page fits the window without scrolling (docs/DESIGN.md, "Home").
  Afterwards "You voted" with the count; guests a sign-in hint. No open poll: no box.
- **The dot on "Polls"** in the sidebar: the number of open polls the member may vote in and has
  not, in the chat's unread badge (`UnreadCount`, as `UnreadDots.jsx`), spoken in the link's
  name ("Polls: 2 open polls to vote in"). Both read `GET /api/polls/summary`
  (`usePollSummary`).

## Live updates

The site's existing ways, as for calls and the chat:

- Every change (a new poll, a vote, an end, an extension, the anonymous switch, a deletion)
  sends `{ type: 'polls' }` to every signed-in member's open pages over the chat's live
  connection (`chat.notify.members`, the hub's `sendToMembers`). The client takes it as a
  personal event (`client/src/chat/connection.js`, `usePersonalEvents`) and reloads the list.
- Guests have no personal events: their page reloads every minute (the interval of
  `client/src/calls/useCallsSummary.js`). Every list also reloads when this page changed a poll
  (`pollsChanged()`, as `callsChanged()`) and right after the next open poll's end time.
- All in `client/src/polls/usePolls.js`.

## Data

`server/src/polls/schema.js`:

| Table                 | Holds                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `polls`               | question, kind (`choice`/`text`), multiple, other text, results (`after_vote`/`after_end`), anonymous, voters (`members`/`steps`/`team`), `ends_at` (null: by hand), `ended_at`, creator (SET NULL), `call_id` (SET NULL), `room_id` (CASCADE) |
| `poll_step_rules`     | the steps of a step poll (a deleted step leaves it)                                                                                                                                                                                            |
| `poll_options`        | the fixed answers in their order                                                                                                                                                                                                               |
| `poll_ballots`        | one per vote: its written text; its account (`user_id`) only when the poll is not anonymous                                                                                                                                                    |
| `poll_ballot_options` | the answers a ballot chose                                                                                                                                                                                                                     |
| `poll_voters`         | who voted in which poll (primary key: poll and account): one vote per account                                                                                                                                                                  |

In an anonymous poll the ballot's `user_id` is empty. `poll_voters` keeps no time and is a
`WITHOUT ROWID` table, so not even the order in which accounts voted is kept to be matched
with the order of the ballots. Deleting an account removes its `poll_voters` rows and its
named ballots (`ON DELETE CASCADE`).

**`poll_ballot_links`** (2026-11-11): for an anonymous poll whose results show after the end,
which ballot is whose (poll, account, ballot), only while the poll is open, so a voter can
replace their ballot. It is never sent anywhere (no API answer, log, audit entry or admin page
carries it). Every row of a poll goes the moment it ends: by hand and with its call at once
(`endPoll`, `endCallPolls`), when its end time passes within 10 seconds (the polls job,
`startPollJobs`, and before every vote and list: `dropEndedLinks`). A trigger,
`poll_links_account_gone`, deletes a still-linked ballot when its account is deleted.
`migratePolls()` adds columns to a polls table from an earlier state of the branch.

## API

All under `/api/polls` (`server/src/polls/routes.js`); the rules are `shared/pollRules.js`,
checked the same way in the form.

| Route                 | Who                | Does                                                                                                                     |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /`               | everyone           | `{ canManage, canDelete, polls }`, each poll as this viewer may see it; `?call=<id>`: that call's only                   |
| `GET /summary`        | everyone           | `{ unvoted, newest }`: the sidebar's dot and the home box                                                                |
| `GET /:id`            | who may see it     | `{ canManage, canDelete, poll }`: one poll (a room poll's card)                                                          |
| `POST /`              | organisers, admins | creates one (`callId`: in that live call; `room`: in that chat room); 400 with the rule's sentence when a rule is broken |
| `POST /:id/vote`      | members            | `{ options, text }`; 400 for a ballot of the wrong shape; 409 `already_voted`, `poll_ended`; 403 `not_allowed`           |
| `POST /:id/end`       | organisers, admins | ends it now (409 when ended)                                                                                             |
| `POST /:id/extend`    | organisers, admins | `{ endsAt }`, later than the current end and now                                                                         |
| `POST /:id/anonymous` | organisers, admins | `{ anonymous }`; 409 `poll_has_votes` after the first vote                                                               |
| `DELETE /:id`         | admins             | deletes it with its votes                                                                                                |

A ballot is checked for its shape too (`validateVote`, 2026-11-13): `options` a list of this
poll's answer ids (none in a text poll), `text` a string; either may be left out. Anything else
answers 400 and stores nothing.

`GET /` also gives organisers and admins `steps` (`{ id, ladder, name }`) for the create form.
A poll as listed: its fields, `options`, `steps` (the names of a step poll's steps), `mayVote`,
`open`, `votes` (ballots), `voted`, `canVote`, `myVote`
(`{ options, text }`, not in an anonymous poll) and `results` (null while this viewer may not
see them): per answer `count` and, when not anonymous and the viewer is signed in, `voters`;
`textCount`; for organisers
and admins `texts` (`{ text, by }`, `by` only when not anonymous). Rate limits per account:
`pollManage` and `pollVote` (30 a minute each).

## Client

`client/src/pages/PollsPage.jsx` (the page), `client/src/pages/HomePollCard.jsx` (the home
box), `client/src/polls/`: `PollCard.jsx` (one poll and
the organisers' actions), `PollVote.jsx`, `PollResults.jsx`, `PollForm.jsx`, `usePolls.js`,
`polls.css`, `Countdown.jsx`; `client/src/calls/CallPolls.jsx` (a call's polls on its page), `ChatPollCard.jsx` (a room
poll's card), `aboveKeyboard.js`.

## Tests

`server/test/polls.test.js`, `shared/pollRules.test.js`, `client/src/polls/polls.test.jsx`,
`client/src/calls/callPolls.test.jsx`, `client/src/polls/chatPolls.test.jsx`, `client/e2e/polls.spec.js`, `client/e2e/callPolls.spec.js`
(two participants), the home layout cases in `client/e2e/layout.spec.js`.
