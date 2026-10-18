# SCALING.md — growing beyond one server

The staged plan (decided 2026-10-18). **Nothing of stages 1–4 is built now**: today everything
runs on one VPS — the site (one Node process with its SQLite database and media folder) and the
call service (LiveKit in Docker, `deploy/calls/`). Each stage is taken only when the one before
is no longer enough, and each names the modules that would change.

## Now: one VPS

- The site: `server/src/index.js`, one process; SQLite (`data/seasonal.db`); chat media and
  uploads in `MEDIA_DIR`; sessions in the database; the chat hub, rate limits and the link-preview
  limits in this process's memory.
- The call service: LiveKit on the same VPS, its own container with 2 CPUs and 2 GB
  (docs/CALLS.md).

## Stage 1 — the call service on its own VPS

When calls take CPU or bandwidth the site needs (watch `docker stats` during big calls).

- Already prepared: copy `deploy/calls/` to the new VPS and set the site's `CALLS_URL`
  (docs/CALLS.md, "Moving the call service to its own VPS"); the CSP follows by itself.
- Code that changes: none. Configuration only: `CALLS_URL`, DNS, the firewall on both machines.

## Stage 2 — media files to object storage and a CDN

When the media folder or its traffic outgrows the VPS.

- `server/src/media/files.js` and `server/src/media/adminRoutes.js`: the sticker/GIF library
  writes to object storage (S3-compatible) instead of `MEDIA_DIR`.
- `server/src/previews/`: preview images likewise.
- `server/src/chat/mount.js`: the public `/media` static route gives way to the CDN's address.
- `server/src/uploads/`: members' files stay access-checked — stored in object storage, served
  through short-lived signed links instead of the file stream.
- `server/src/http/securityHeaders.js`: `img-src` gains exactly the CDN's origin.
- `server/src/config.js`: the bucket, CDN origin and keys as environment keys.

## Stage 3 — several app servers behind a load balancer

When one Node process can no longer serve the site. Needs stage 2 first (no local files).

- **PostgreSQL instead of SQLite**: `server/src/db/database.js` and every area's schema and
  store (`accounts/`, `twofa/`, `keys/`, `audit/`, `info/`, `events/`, `games/`, `chat/`,
  `media/`, `previews/`, `uploads/`, `settings/`, `calls/`); better-sqlite3 is synchronous, so
  every store and the routes calling it become asynchronous; `db/addColumns.js` gives way to
  real migrations; transactions (`db.transaction`) move to the PostgreSQL client.
- **Redis for sessions**: `server/src/http/session.js` (the session store; the chat WebSocket
  reuses the same middleware).
- **Redis for the chat hub's fan-out**: `server/src/chat/hub.js` keeps sockets per process and
  publishes every push (room messages, personal events, presence) through Redis so the other
  processes deliver it; `hub.onlineUserIds()` reads presence from Redis.
- **Redis for rate limits**: `server/src/http/rateLimit.js` (express-rate-limit's store),
  `server/src/chat/senderLimit.js`, the link-preview limits in `server/src/previews/service.js`.
- **One leader for background jobs**: the chat retention job and the session sweep run in one
  process only.
- The load balancer: WebSocket upgrades for `/ws/chat`; `TRUST_PROXY` counts it.
- The call area itself needs no change: its state is in the database and on the call service.

## Stage 4 — LiveKit on several nodes

When one call server is not enough (many large calls at once).

- `deploy/calls/`: several LiveKit nodes sharing a Redis (`redis:` in `livekit.yaml`), each with
  its own port range and firewall rules; optionally regions.
- The site: `CALLS_URL` points at the nodes' common address; `server/src/calls/service.js` and
  the tokens stay the same (LiveKit routes rooms between its nodes).
