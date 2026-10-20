# CLAUDE.md — build rules for Seasonal Entertainment

These rules apply to every change in this repository, by people and by agents.

## Language

- English everywhere: code, comments, docs, commit messages, UI text.

## Source files

- Every source file starts with a header comment: what it does and where it belongs
  (`File`, `Path`, `Project`, `Description`). JSON files cannot hold comments; their purpose
  goes in a `description` field where the format has one.
- Inline comments at the important places: the _why_, not a retelling of the code.
- No dead code and no dead variables. ESLint treats unused variables as errors.
- Before writing a new helper, check whether one already exists and reuse it.
- Keep source files short. When a file grows, extract a part into its own file.

## Every change

- Updates docs, comments and file headers in the same commit.
- Adapts and extends the tests. Every test must be able to fail: break the behaviour once on
  purpose, see the test go red, restore.
- `npm run verify` must be green before a change is called done.

## Git

- One branch per topic. Merge into `master` only when all checks are green and the owner has
  approved.
- Always push the working branch, even when it is not being merged.
- After a branch is merged and the CI run on `master` for the merge commit is green, delete
  the branch on origin (`git push origin --delete <branch>`) and locally (`git branch -d`,
  merged branches only, never `-D`) without asking (decided 2026-10-17). `master` is never
  deleted; `.claude/settings.json` denies it.
- No force push, no history rewriting.
- Agents (decided 2026-10-20): `.claude/settings.json` asks for nothing. Merges happen only
  when a task says the owner approved them; the deny rules (force push, mirror, rebase, amend,
  `reset --hard`, worktrees, `gh api`, repository edits, deleting `master`, risky `rm`, `.env`
  reads) stay. Run git and gh steps as single simple commands, not chained with `;`, `&&` or
  pipes into other tools, so each one matches the allow list on its own.

## Decisions

- Never quote the owner in the repository. State decisions as facts with a date, for example
  "License: AGPL-3.0-or-later (decided 2026-10-16)."

## Where things are

- Architecture, ports and folder layout: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Open and closed work: [docs/BACKLOG.md](docs/BACKLOG.md)
