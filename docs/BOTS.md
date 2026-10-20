# Prices and events from the owner's bots

The site shows data that two of the owner's bots already collect (SE-NIGHT-3, 2026-10-20). The
bots live in the private repository `weudlll-cyber/Seasonal-tokens`; the site only **reads**
their SQLite files and never talks to the bots themselves.

| Bot             | Its file on the VPS                       | Config key               | What the site shows                                      |
| --------------- | ----------------------------------------- | ------------------------ | -------------------------------------------------------- |
| `stpricebot`    | `/var/lib/stpricebot/snapshots.db`        | `PRICE_BOT_DB`           | the home card's prices, the charts at `/info/prices`     |
| `stannouncebot` | `/var/lib/stannouncebot/stannouncebot.db` | `EVENT_BOT_DB`           | `/events` and the home page's "Up next": the only events |
| `stpricebot`    | `/var/lib/stpricebot/mining_rates.json`   | `PRICE_BOT_MINING_RATES` | the fair price and the converter's mining times          |

Each key is a file path. **Unset, that feature is off** and the page says plainly that the
data source is not connected: the home card shows the season marks and "Prices: the data source
is not connected.", `/info/prices` says there are no prices to show, `/events` says "The event
calendar is not connected, so there are no events to show." and "Up next" on the home page "The
event calendar is not connected.".

## What is read

- **Prices**: `snapshots(ts_ms INTEGER, token TEXT, price REAL, PRIMARY KEY (ts_ms, token))`,
  one row per token per hour. `token` is a season's name in lower case: `spring`, `summer`,
  `autumn`, `winter`. Prices are US dollars (`server/src/bots/prices.js`).
  - Latest: each token's newest snapshot, its change against the snapshot 24 hours before it
    (none when the bot has no price that old), and the last day's prices for the sparkline.
  - History: one token over `24h`, `7d`, `30d`, `1y` or `all`, counted back from its newest
    snapshot. More than 500 snapshots are thinned out: the range is cut into 500 equal time
    slices and each keeps its last snapshot, so every point is a real price at a real time.
- **Events**: `events`, `occurrences` and `occurrence_overrides` (`server/src/bots/events.js`).
  - The occurrences the bot has generated or been given; the site computes **no recurrences**
    of its own (the bot's `recurrence_rules` are not read).
  - Only active events (`events.active = 1`).
  - The latest override per occurrence wins (the highest `id`, as the bot itself does it in
    `parsing/query_service.py`): its start, platform, location and status replace the
    occurrence's wherever it sets them.
  - Statuses: `scheduled`, `done` (shown as usual), `canceled` (struck through, "canceled").
  - Times are ISO-8601 UTC text (`…Z` or `…+00:00`; no offset counts as UTC). `/events` shows
    them in the viewer's time zone with the UTC time beside them.

## The routes

All public (guests too), read-only, rate limited per address (`botRead`: 120 a minute) and
cached in memory for **5 minutes** per question (`server/src/bots/routes.js`):

| Route                                   | Answer                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/prices`                       | `{ connected, prices: [{ token, price, at, change24h, spark }] }`                                                                                       |
| `GET /api/prices/:token?range=7d`       | `{ connected, token, range, points: [[ms, price], …] }` (at most 500)                                                                                   |
| `GET /api/bot-events?from=<ms>&to=<ms>` | `{ connected, occurrences: [{ id, name, description, category, start, platform, locationLabel, locationUrl, status }] }`; the window at most eight days |

A configured file that cannot be read (missing, locked, being replaced) answers **503**
`bot_unavailable`; the reason goes to the server log, and the next request tries again
(failures are not cached).

## Read-only, by construction

- Every read opens the file with `{ readonly: true, fileMustExist: true }`, sets
  `PRAGMA query_only = ON`, runs its query and closes the file again (`server/src/bots/botDb.js`).
  A missing file is never created, and the bot can rewrite or replace its file at any time.
- The site never writes to these files, never calls the bots' admin web, never needs their admin
  token, and never calls any outside price API.
- In production both files are mounted into the site container **read-only** (`:ro`,
  docs/DEPLOYMENT.md), so even a mistake in the site could not change them.
- `server/test/botData.test.js` checks that a write through the site's handle is refused and that
  the files' bytes are unchanged after every route has read them.

## Bot text is untrusted

- Names, descriptions, platforms and labels are rendered as text only (React escapes them; no
  HTML is ever interpreted).
- A `location_url` becomes a link only if it is `http:` or `https:`; anything else (`tg://…`,
  `javascript:…`) is dropped on the server. Links open with `rel="noopener noreferrer"`.
- `image_url` is never passed on: the **server** fetches the image itself (see "Event images"),
  the browser loads it from this site only, and the CSP stays as it is.

## Event images

An event's `image_url` (http(s) only) is shown on `/events` and, small, in "Up next", with the
event's name as alt text (owner decision 2026-10-20; `server/src/bots/images.js`):

- **Fetched by the server, never by the browser**, through the link previews' image fetch
  (`server/src/previews/fetchImage.js`, handed over by the chat area's `mountChat`) and its
  network guard (`safeFetch.js`, `ipPolicy.js`):
  https on port 443 only, every DNS answer a public address (no private, loopback or cloud
  metadata addresses), redirects checked, 5 seconds, at most 2 MB, a real JPEG, PNG, WebP or GIF.
  A plain `http://` image is refused like any other.
- **Re-encoded like uploaded images**: turned upright, every metadata block (EXIF with GPS, XMP,
  comments) dropped, scaled down to 640 px wide, stored as WebP in the media folder as
  `bot-images/<first 32 hex digits of the URL's SHA-256>.webp` and served by the public media
  route (`/media/bot-images/…`; only such exact names, `server/src/chat/mount.js`).
- **At most once a day per URL**: a missing image is fetched in the background when the event
  is first shown; afterwards once a day. A failed refresh keeps the image there was. The address
  carries `?v=<when it was stored>`, so the media route's year-long cache never shows an old one.
- **A failed or refused image**: the event shows without one; the server log says why, once.

## Only the bot's events

Events are kept **only in the event bot** (decided 2026-10-20): the site's own events calendar,
its admin editor and its seeded schedule are gone, so there is no duplicate between the two any
more. "Up next" on the home page asks for the next seven days from the full hour (one cached
question per hour) and shows the next two scheduled occurrences that have not started.

## Fair price and converter

On `/info/prices`, below the chart, exactly as the price bot's `/value` and `/swap` work them
out (owner decision 2026-10-20; `client/src/prices/fairPrice.js`, ported with the bot's own test
numbers):

- **Mining rates**: the price bot's `mining_rates.json` in its runtime folder (`ST_RUNTIME_DIR`,
  next to `snapshots.db`), tokens mined per hour per season, e.g. `{"Spring": 42.0, …}`. Read
  read-only and re-read at most every 5 minutes (`server/src/bots/miningRates.js`), as the bot's
  `load_mine_rates` accepts it: every season there with a rate above 0. Unset, missing or
  invalid: the fair price table and the mining times say the mining rates are not available.
- **Fair price** (`compute_fair_prices`): over the seasons that have a price, K = average of the
  actual prices ÷ average of 1 / mining rate; a season's fair price = K ÷ its mining rate;
  deviation = (actual − fair) ÷ fair × 100 %; underpriced when actual < fair; ranked by actual ÷
  fair, best buy first. A season mined at half the rate is worth twice as much.
- **Converter** (`/swap`): an amount of Spring, Summer, Autumn, Winter or ETH (only while ETH is
  connected, see "Reference prices") into another: converted = amount × price(from) ÷ price(to).
  Each side that is a season gets its mining time in hours (the from side: the amount entered;
  the to side: the converted amount) = amount ÷ mining rate, with days too over 48 hours. ETH has
  none.

## What is not shown, and why

- **ETH and POL prices**: the price bot does not store them (it fetches them live and keeps only
  the four seasonal tokens), and the site calls no outside price API. Open owner decision.
- **A ratio view between seasons** (e.g. Spring in Summer): not built; open owner decision.
- **Reminders, reactions, announcements, dispatch logs**: bot internals, not read.

## Development data

`npm run dev:bot-fixtures` (`scripts/build-bot-fixtures.mjs`, data in
`server/src/bots/fixtures.js`) builds two stand-in databases with the bots' exact schemas and
**clearly fake, seeded** data into `data/bot-fixtures/` (gitignored, like all of `data/`):

- a year of hourly prices for the four tokens (a seeded random walk around a few tenths of a US
  cent, ±1 % per hour at most), and fake mining rates (`mining_rates.json`: 40, 30, 60, 50);
- a few weekly `[Sample]` events from two weeks back to four ahead: past ones `done`, one moved
  by two overrides (the later wins), one canceled this week, one inactive (never shown) and one
  with a non-web link (shown as text);
- event images: three events name one on the fixture's own host `images.bot-fixtures.test`
  (drawn into `data/bot-fixtures/images/`), one a plain `http://` image the guard refuses. In
  development only, the server answers that reserved host from those files
  (`server/src/bots/fixtureNetwork.js`): the guard stays on, the host gets a public placeholder
  address and only its connection is dialled locally, as in the link-preview tests. No other
  host is reached; with a copy of the real bot (no `images/` folder beside it) development uses
  the real internet.

`npm run dev` points `PRICE_BOT_DB` and `EVENT_BOT_DB` at these files when neither the shell nor
`.env` sets them. A key set to an empty value in `.env` keeps that bot off, to see the "not
connected" state. No real bot data is ever in the repository. Run the script again to move the
sample week to the current one.

## Tests

- `server/test/botData.test.js`: not connected; latest prices, change and sparkline; history per
  range with at most 500 points; never written; the five-minute cache; the rate limit; the
  event week with overrides, canceled and inactive events, only web links and never the bot's
  image URL; 503
  for an unreadable file.
- `client/src/prices/prices.test.jsx`: the home card (prices, change colours, sparklines; the
  marks and the note without the bot); `/info/prices` (token and range asked for, hover and
  arrow keys read a price at local time; "not connected"); the formats.
- `client/src/pages/eventsPage.test.jsx`: the bot week at local times across daylight saving,
  canceled, text only and safe links, the week asked for, "not connected".
- `client/src/pages/LandingPage.test.jsx`: "Up next" (the next two scheduled occurrences that
  have not started; "not connected").
- `server/test/botImages.test.js`: an event's image fetched, re-encoded as WebP without
  metadata, stored by the URL's hash and served from this site; a private address, plain http
  or a non-image refused; at most once a day.
- `server/test/botMiningRates.test.js`: the bot's file format; a missing season or a rate of 0
  (the bot's own loader tests) not available; re-read at most every 5 minutes.
- `client/src/prices/fairPrice.test.js`: the bot's `test_fair_prices.py` cases with their
  numbers, the whole table worked out by hand, a missing price, the conversions and hours.
- `client/src/prices/fairAndConverter.test.jsx`: the table and the converter on the page; ETH
  only while connected; without the mining rates.
- `server/test/droppedTables.test.js`: the old `events` table is dropped on start.
- `client/e2e/events.spec.js`: the real server reading a fixture event bot; no events editor in
  the admin area.
- `server/test/info.test.js`: the info slug `prices` is reserved (`/info/prices` is this page).
