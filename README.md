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
npx playwright install chromium   # once, for the browser test
npm run verify                    # lint, format, tests, build, browser smoke test
```

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/BACKLOG.md](docs/BACKLOG.md),
build rules in [CLAUDE.md](CLAUDE.md).

## License

Copyright (C) 2026 weudlll-cyber

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version. See [LICENSE](LICENSE).
