# Project-lead review: website and game integration recommendations

**Purpose:** Ask the project lead for an independent assessment of the priority, scope,
architecture and effort of the proposals below before implementation is authorized.
This is a discussion brief, not an approved roadmap.

## Decisions (2026-11-09)

- **A** (harden account-change synchronization): rejected. The feed keeps changes 365 days and
  polling suffices.
- **B** (logout and revocation): a password change or an admin's password reset notes "rights",
  so both games end the member's sessions (built, `night/2026-11-10`). Sign-out everywhere and
  per-device logout are not planned.
- **C** (exposure between same-origin applications): the website's cookies are stripped in the
  games' own route files (requested from both game plannings on 2026-11-09).
- **D** (explicit game permissions) and **E** (per-game sync token): not needed while both games
  are the owner's own on the same server. Hosting is granted per game (built,
  `night/2026-11-10`).
- **F** (dependencies and operations): the development dependencies are updated
  (`night/2026-11-10`, piece 6); the live restore drill is open; Imprint and Privacy were filled in
  on the live site on 2026-11-04 (the seed placeholders apply only to a fresh install).

## Context and evidence

The read-only repository audit covered Seasonal Entertainment `master` at
`a1498a4d4700fdcb6a53dc936d1bf97b92871f6b` on 2026-11-07. The website integrates
Seasonal Bingo Royale and Seasonal Mini Games under `/games/<slug>/`. The website
authenticates players through a reverse-proxy identity-header contract; each game
maintains its own account records and sessions. Games embed the website chat in an iframe.

Observed at the audit snapshot:

- GitHub CI passed: 1,440 unit tests, 176 browser tests, and deployment checks.
- Measured line coverage: shared 100%, server 96.4%, client 94.4%.
- `npm audit` reported zero production advisories and four moderate development-only
  dependency entries associated with ESLint/minimatch.
- A Git-history secret scan reported eight findings; review classified them as public
  Discord identifiers and test values, not verified production credentials.
- No high-confidence exploitable vulnerability was verified in the reviewed areas. This
  is a static review, not a penetration test or proof of security.
- The repository documents incomplete single logout and delayed game-account
  synchronization. No live-server inspection or live backup restore was performed.

The current integration contract and its limitations are documented in
[GAME-INTEGRATION.md](GAME-INTEGRATION.md). Recheck current code and operational
configuration before treating this snapshot as current.

## Decisions requested

Please advise on the following before we schedule implementation:

1. **Revocation semantics:** Should a normal website logout affect only the website
   session, or also game sessions? Should a separate "sign out everywhere" revoke every
   website and game session? Do password change/reset and account lock always revoke game
   sessions?
2. **Revocation scope:** Is account-wide revocation acceptable for the first version, or
   must "this device" logout revoke only sessions belonging to that device? The current
   change feed identifies an account, not a specific device or game session.
3. **Stale permissions:** What is the maximum acceptable delay for a lock or role
   removal to take effect? Which actions, if any, must fail closed when a game's last
   successful account-feed poll exceeds that limit?
4. **Game administration:** Should website `admin` continue to map to broad game
   administration, or should the website grant explicit per-game capabilities such as
   `may_host` and `may_manage_game`?
5. **Isolation and cookies:** Are all games behind the website reverse proxy trusted to
   the same degree as the website? Should the proxy forward only the game's own cookies
   and strip the website session cookie? If a game is independently operated or less
   trusted, should it be required to use a separate origin?
6. **Feed credentials:** Is one shared website-to-games sync token acceptable, or should
   each game receive a distinct credential with revocation and rotation procedures?
7. **Scope and sequencing:** Which of these proposals should be prioritized, deferred,
   or rejected? What must be completed before the next game is integrated?

## Proposals for review

### A. Harden account-change synchronization

**Current behavior:** The website records account changes; games poll using a persistent
cursor and sync token. Bingo polls about every two minutes; Mini Games polls about every
15 seconds under normal conditions. Failures back off/retry and may increase the delay.
The feed includes `deleted`, `locked`, `unlocked`, and `rights` changes. Once a game
processes relevant changes, it revokes affected game sessions; role mappings are
recomputed on the next sign-in.

**Proposal:** Agree a maximum revocation delay, expose last-success and failure status,
alert on prolonged failures, and make designated privileged actions fail closed when
feed freshness exceeds the agreed threshold. Add reconciliation for games offline long
enough that feed retention might no longer cover their cursor. Keep page processing
idempotent and cursor updates durable.

**Questions:** Is polling at a shorter interval sufficient, or is a signed push/event
channel warranted? Which game actions should be blocked during a feed outage? What is
the desired behavior if a game has been offline beyond journal retention?

### B. Define logout and revocation behavior

**Current behavior:** Website and games maintain separate sessions. A normal website
logout does not currently revoke the user's game sessions. Password changes/resets are
not represented as revocation events in the game account-change contract.

**Proposal:** First define user-visible semantics. A relatively bounded first step is
account-wide revocation for explicit "sign out everywhere", password change/reset, and
account lock. Normal device logout can remain local if clearly explained. Account-wide
events can use the existing journal/feed pattern, expanded with explicit event kinds and
tests.

**Separate-device logout is a larger change:** the existing feed is keyed by account,
so it cannot target only a particular game session. That likely requires a per-device
session identity or a direct revocation mechanism, plus a reviewed privacy and
reliability design. Please do not assume this is included in account-wide logout.

### C. Reduce exposure between same-origin applications

**Current behavior:** Games are routed under the website's origin. The integration guide
records that the proxy does not explicitly remove the website session cookie from every
request forwarded to game servers. Same-origin games are not a browser security isolation
boundary.

**Proposal:** Determine exactly which cookies each route forwards, then explicitly pass
only the game session cookie to game application routes. Preserve the website cookie on
the website's own authorization subrequest and chat routes. Add nginx and Caddy tests for
cookie allowlisting, WebSockets, and sign-in. Treat this as defense in depth, not a
replacement for trusting the game server or a separate-origin design.

For games that are independently operated or not equally trusted, assess a separate
origin and a standard identity-provider flow. OIDC Authorization Code + PKCE is a
candidate, but it is not a switch already supported by the website.

### D. Make game permissions explicit

**Current behavior:** Website `Can-Host` maps to the game's organizer capability;
website `admin` maps to `game_admin`. This is convenient but grants broad game
administration to website administrators.

**Proposal:** Consider explicit, least-privilege per-game claims, for example
`game:<slug>:host` and `game:<slug>:manage`, or an equivalent capability contract.
Define who grants and audits them, how removal propagates, and what happens to existing
game-local administrators. Never map website claims to game `super_admin` or
`security_admin`.

### E. Reduce synchronization-token scope

**Current behavior:** Enabled games share one `X-Games-Sync-Token`.

**Proposal:** Give each game its own high-entropy token, support rotation without
exposing secrets in logs or status output, and specify how installation/update handles
old and new credentials during rollout. Evaluate the operational cost against the
reduced blast radius.

### F. Dependency and operational follow-through

- Review and update the moderate development-only ESLint/minimatch dependency chain in a
  dedicated change; run the full CI after any breaking upgrade.
- Perform and document a real restore drill for an encrypted backup.
- Before public operation, complete and review the owner-specific legal/privacy
  placeholders in the seeded Imprint and Privacy pages. This is an operational/legal
  prerequisite, not a code-security finding.

## Preliminary effort estimate

These are rough engineering estimates for website, installer/proxy work, both game
repositories, integration tests and review. They are **not committed delivery dates**.
They assume the current Node/SQLite architecture, one engineer familiar with the code,
working CI, and no major product redesign. Work can overlap, but cross-repository
coordination and end-to-end rollout add calendar time.

| Work item                                                                                   | Preliminary effort  |
| ------------------------------------------------------------------------------------------- | ------------------- |
| Update development dependency chain and address breaking changes                            | 0.5–1.5 person-days |
| Explicit cookie forwarding rules and proxy regression tests                                 | 1–2 person-days     |
| Feed freshness, fail-closed policy, alert/status and stale-cursor recovery                  | 3–5 person-days     |
| Account-wide logout/revocation for "sign out everywhere", password changes/resets and locks | 2–4 person-days     |
| Per-device logout in addition to account-wide revocation                                    | +3–6 person-days    |
| Explicit per-game capability mapping in website and both games                              | 3–6 person-days     |
| Per-game sync credentials and installer migration/rotation                                  | 1–2 person-days     |
| Versioned shared contract tests, docs and coordinated rollout                               | 2–4 person-days     |
| Encrypted live-backup restore drill                                                         | 0.5–1.5 person-days |

Earlier combined estimate: approximately **13–25 person-days** for the listed
engineering changes, plus **3–6** for per-device logout. These ranges can overlap and
may double-count shared integration work; please reassess them from the proposed target
scope rather than summing every row mechanically. Legal/privacy review effort is not
included.

## Suggested review response

Please return:

1. Your recommendation for each decision above (accept, revise, defer, or reject), with
   rationale and any security/product tradeoffs.
2. A prioritized minimum-safe scope and a later/improvement scope.
3. A revised estimate by repository (`seasonal-entertainment`, Bingo, Mini Games) and
   integration/operations, noting dependencies and uncertainty.
4. Acceptance criteria and rollout/rollback plan for the selected scope.
5. Any material issue this audit missed or any recommendation you believe is unnecessary.

Do not implement changes solely from this discussion brief. Confirm the selected behavior
and scope first; then update the integration contract and tests alongside implementation.
