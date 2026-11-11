# Seasonal Entertainment

Website for games, community and everything around Seasonal Tokens.

## Run it

Needs Node 22 or newer (Node 24 LTS recommended).

```sh
npm install
npm run dev        # client http://localhost:5380, API on port 3800
```

Production shape (one process):

```sh
npm run build
npm start          # http://127.0.0.1:3800 — set HOST and PORT to change
```

## Check it

```sh
npx playwright install chromium   # once, for the browser tests
npm run verify                    # lint, format, tests, build, browser tests
```

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/BACKLOG.md](docs/BACKLOG.md),
[docs/POLLS.md](docs/POLLS.md) (polls),
build rules in [CLAUDE.md](CLAUDE.md).

## Integrate a game

Start with [docs/GAME-INTEGRATION.md](docs/GAME-INTEGRATION.md): the shared website login,
chat and account-sync contracts, setup steps, a copyable task brief and an acceptance checklist
for new games and existing standalone games. Current behavior and proposed improvements are
marked separately.

For an independent review of proposed account synchronization, logout, isolation and
permission improvements, see [docs/PROJECT-LEAD-REVIEW.md](docs/PROJECT-LEAD-REVIEW.md).

## License

Copyright (C) 2026 weudlll-cyber

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version. See [LICENSE](LICENSE).
