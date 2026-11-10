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
  the results once the poll has ended.
- **Changing a vote**: only in a poll whose results show after the end, until the end;
  otherwise a vote is final. In an **anonymous** poll a vote is always final: nothing links an
  account to its ballot there, so there is nothing to change (see "Data"; decision taken
  unattended on 2026-11-10, open for the owner's word).
- **Anonymous or not**, chosen at creation; organisers and admins can switch it until the
  first vote, then it is fixed.
  - **Anonymous**: nobody, admins included, sees who voted what. Only what keeps it to one
    vote per account is stored.
  - **Not anonymous**: everyone who may see the results sees the names per answer, and the
    vote form says "This poll is not anonymous – your name will be shown".
- **End**: a fixed end time or "end by hand". Organisers and admins end a poll early and
  extend it (a later end time, also for one that was to end by hand) while it is open. Ended
  polls stay on the page with their results, after the open ones (the archive). **Only admins
  delete** a poll (with its votes), after a question.
- **Audit**: `poll.create`, `poll.end`, `poll.extend`, `poll.delete` (with the question; an
  extension also with the new end). The anonymous switch is not audited.
- **Deleting an account** removes its votes and written answers in polls that are not
  anonymous, as its chat messages (decided 2026-11-01). In an anonymous poll its ballot
  carries nothing of the account and stays; only the mark that it voted goes.

## The home page and the sidebar

- **The Poll box** on the home page (`client/src/pages/HomePollCard.jsx`, `homePoll.css`): the
  newest open poll the viewer sees, in the top row beside "Up next", which then takes one column
  (it shows only the entries that fit). The question is clamped at 2 lines. A single-choice poll
  without a written answer is voted right in the box: a dropdown of the answers and "Vote" on
  one line, with "Not anonymous: your name is shown." above when it is not anonymous. A poll
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

| Table                 | Holds                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `polls`               | question, kind (`choice`/`text`), multiple, other text, results (`after_vote`/`after_end`), anonymous, voters (`members`/`steps`/`team`), `ends_at` (null: by hand), `ended_at`, creator (SET NULL) |
| `poll_step_rules`     | the steps of a step poll (a deleted step leaves it)                                                                                                                                                 |
| `poll_options`        | the fixed answers in their order                                                                                                                                                                    |
| `poll_ballots`        | one per vote: its written text; its account (`user_id`) only when the poll is not anonymous                                                                                                         |
| `poll_ballot_options` | the answers a ballot chose                                                                                                                                                                          |
| `poll_voters`         | who voted in which poll (primary key: poll and account): one vote per account                                                                                                                       |

In an anonymous poll the ballot's `user_id` is empty. `poll_voters` keeps no time and is a
`WITHOUT ROWID` table, so not even the order in which accounts voted is kept to be matched
with the order of the ballots. Deleting an account removes its `poll_voters` rows and its
named ballots (`ON DELETE CASCADE`).

## API

All under `/api/polls` (`server/src/polls/routes.js`); the rules are `shared/pollRules.js`,
checked the same way in the form.

| Route                 | Who                | Does                                                                      |
| --------------------- | ------------------ | ------------------------------------------------------------------------- |
| `GET /`               | everyone           | `{ canManage, canDelete, polls }`, each poll as this viewer may see it    |
| `GET /summary`        | everyone           | `{ unvoted, newest }`: the sidebar's dot and the home box                 |
| `POST /`              | organisers, admins | creates one; 400 with the rule's sentence when a rule is broken           |
| `POST /:id/vote`      | members            | `{ options, text }`; 409 `already_voted`, `poll_ended`; 403 `not_allowed` |
| `POST /:id/end`       | organisers, admins | ends it now (409 when ended)                                              |
| `POST /:id/extend`    | organisers, admins | `{ endsAt }`, later than the current end and now                          |
| `POST /:id/anonymous` | organisers, admins | `{ anonymous }`; 409 `poll_has_votes` after the first vote                |
| `DELETE /:id`         | admins             | deletes it with its votes                                                 |

`GET /` also gives organisers and admins `steps` (`{ id, ladder, name }`) for the create form.
A poll as listed: its fields, `options`, `steps` (the names of a step poll's steps), `mayVote`,
`open`, `votes` (ballots), `voted`, `canVote`, `myVote`
(`{ options, text }`, not in an anonymous poll) and `results` (null while this viewer may not
see them): per answer `count` and, when not anonymous, `voters`; `textCount`; for organisers
and admins `texts` (`{ text, by }`, `by` only when not anonymous). Rate limits per account:
`pollManage` and `pollVote` (30 a minute each).

## Client

`client/src/pages/PollsPage.jsx` (the page), `client/src/pages/HomePollCard.jsx` (the home
box), `client/src/polls/`: `PollCard.jsx` (one poll and
the organisers' actions), `PollVote.jsx`, `PollResults.jsx`, `PollForm.jsx`, `usePolls.js`,
`polls.css`.

## Tests

`server/test/polls.test.js`, `client/src/polls/polls.test.jsx`, `client/e2e/polls.spec.js`.
