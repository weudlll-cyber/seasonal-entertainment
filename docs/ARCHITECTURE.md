# Architecture

## Decisions

- Public repository `weudlll-cyber/seasonal-entertainment`, license AGPL-3.0-or-later,
  copyright holder weudlll-cyber (decided 2026-10-16).
- Same stack as the race game (decided 2026-10-16).
- Luxora Grotesk may be used on the web (confirmed 2026-10-16).
- Target runtime is a Linux VPS running for months. Nothing in the code may assume Windows.

## Stack

| Part    | Technology                                           |
| ------- | ---------------------------------------------------- |
| Client  | React 19 + Vite                                      |
| Server  | Node 24 LTS + Express 5                              |
| Storage | SQLite, added with the first feature that needs it   |
| Tests   | Vitest (server and client), Playwright (browser)     |
| Quality | ESLint (flat config), Prettier                       |
| CI      | GitHub Actions, runs `npm run verify` (see `ci.yml`) |

The repository is one npm workspace root with two packages, `server` and `client`, and one
lockfile. There is no `shared/` package yet: nothing is shared between the two sides. Create it
only when real code is needed by both.

## Ports

The race game uses 5173 and 4173; this project stays clear of them.

| Port | What                                                     |
| ---- | -------------------------------------------------------- |
| 3800 | Server (`npm start`, and the API behind `npm run dev`)   |
| 5380 | Vite dev server (`npm run dev`), forwards `/api` to 3800 |
| 3810 | Server started by the Playwright browser tests           |

## Runtime configuration

Read from the environment when the process starts, never baked into a build:

| Variable      | Default                   | Used by                                      |
| ------------- | ------------------------- | -------------------------------------------- |
| `HOST`        | `127.0.0.1`               | server listen address                        |
| `PORT`        | `3800`                    | server listen port                           |
| `CLIENT_DIST` | `client/dist`             | folder of the built client the server serves |
| `COMMIT_SHA`  | output of `git rev-parse` | commit reported by `/api/health`             |
| `CLIENT_PORT` | `5380`                    | Vite dev server port                         |
| `API_ORIGIN`  | `http://127.0.0.1:3800`   | where the Vite dev server forwards `/api`    |

The client only ever calls relative URLs (`/api/...`), so the same build works on any host.

## How it runs

- **Development** (`npm run dev`): Vite on 5380 serves the client with hot reload and forwards
  `/api` to the server on 3800, which restarts on file changes.
- **Production** (`npm run build`, then `npm start`): one Node process. Express answers `/api`
  and serves `client/dist` as static files.

## Folder layout

```
.github/workflows/ci.yml   CI: npm run verify
.claude/settings.json      agent permissions for this repository
client/                    React + Vite client
  index.html               HTML shell
  e2e/                     Playwright browser tests; drawnBox.js measures drawn pixels
  src/main.jsx             entry point
  src/pages/               one folder entry per page (component, CSS, test side by side)
  src/styles/              tokens.css (all design tokens), fonts.css, base.css
  src/assets/              logo, season marks, fonts (woff2)
  src/test/setup.js        Vitest setup
server/
  src/index.js             entry point: config, app, listen
  src/app.js               Express app (routes); no listen, so tests drive it directly
  src/config.js            environment configuration
  src/buildInfo.js         version and commit for /api/health
  test/                    Vitest tests
scripts/
  dev.mjs                  npm run dev
  verify.mjs               npm run verify
docs/                      this file and the backlog
```

## Assets

Copied from the owner's Seasonal Token folder and renamed to lowercase:

| In the repo                            | Original file                                  |
| -------------------------------------- | ---------------------------------------------- |
| `assets/seasonal-entertainment.jpg`    | `seasonal_entertainment.jpg`                   |
| `assets/seasonal-tokens.svg` (favicon) | `Seasonal_Tokens-02.svg`                       |
| `assets/seasons/spring.svg`            | `Spring_Season-02.svg`                         |
| `assets/seasons/summer.svg`            | `Summer_Season-02.svg`                         |
| `assets/seasons/autumn.svg`            | `Autumn.svg`                                   |
| `assets/seasons/winter.svg`            | `Winter_Season-02.svg`                         |
| `assets/fonts/luxora-grotesk-*.woff2`  | the six `.otf` files, converted with fontTools |

Font weights: Book 400 (body), Regular 500, Bold 700, Heavy 900 (headings), Italic 400 italic,
Light Italic 300 italic. Book and Regular both carry weight 400 inside the files; Regular is
mapped to 500 so both remain usable.

### Season marks are corrected to be round

The original artwork is not round: the drawn ring of each mark (bounding box of its non-white
pixels at native size) measures width/height spring 1.020, summer 1.000, autumn 0.911,
winter 0.885. Every variant in the source folder has the same distortion. The repo copies are
corrected on the root `<svg>` only, paths untouched (2026-10-17): `viewBox` = original
width/height, `preserveAspectRatio="none"`, and `width` = original width ÷ measured ratio, so
the drawn ring becomes 1:1. Summer needs no correction and is unchanged.

| Mark   | Original width × height | Corrected width × height | Drawn ratio after |
| ------ | ----------------------- | ------------------------ | ----------------- |
| spring | 2614 × 2550             | 2563 × 2550              | 1.000             |
| summer | 2584 × 2550             | unchanged                | 1.000             |
| autumn | 2476 × 2550             | 2719 × 2550              | 1.000             |
| winter | 2244 × 2550             | 2535 × 2550              | 1.000             |

The ring belongs to the artwork; the page draws no ring of its own. A new or replaced mark
must be measured and corrected the same way; `client/e2e/seasonMarks.spec.js` fails when a
mark on the page is not round within 2 %.

## Planned areas

None of these exist yet. Each gets its own branch and backlog entry.

- **Accounts**: Discord and Telegram login; 2FA for organisers and admins.
- **Info pages**: content pages, edited by admins in the browser.
- **Games hub**: list of games; the race game connected here.
- **Chat**: community chat.
- **Bots**: Discord/Telegram bots and group roles.
- **Admin pages**: management screens, including an events calendar that is edited without
  code changes.

## Adding a new area or game

1. Open a branch and a backlog entry for it.
2. Server: add a router file per area (for example `server/src/routes/games.js`) mounted under
   `/api/<area>` in `app.js`, with its tests in `server/test/`.
3. Client: add the page(s) under `client/src/pages/`, styled only with tokens from
   `tokens.css`; add client-side routing when the second page arrives.
4. A game that lives in its own repository (like the race game) is connected from the games
   hub by link or embed; it keeps its own server and ports.
5. Extend tests (unit and, where a page is visible to users, the browser test), update this
   file and the backlog, run `npm run verify`.
