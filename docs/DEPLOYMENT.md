# Deployment

How the site goes onto a server: **one command** on an Ubuntu 22.04 or 24.04 server
(`deploy/install.sh`, SE-INSTALL-1). The installer puts the site in Docker with automatic HTTPS,
adds the call service (optionally with recording) and the encrypted nightly backups, and creates
the first admin. It works on an empty server (the site brings its own Caddy) and beside an nginx
that already serves other sites. **First real deployment: 2026-11-01** (commit `d1f8837`, nginx
mode beside an existing nginx site, with calls, recording and backups). The manual steps the
installer automates are kept at the end as a reference.

Examples use `example.org` for the site and `calls.example.org` for the call service; put your
own names in their place.

## Requirements

- A server with **Ubuntu 22.04 or 24.04**, root access (`sudo`), about 2 CPU cores and 4 GB RAM
  for the site alone. Calls need more: one core per busy call room, plus one core while a
  recording runs (docs/CALLS.md, docs/SCALING.md).
- A domain with DNS **A records** pointing at the server: the site's name (`example.org`), the
  `www.` name if www should redirect, and the calls name (`calls.example.org`) if you want calls.
  Add **AAAA** records too, but only if the server has IPv6. The records must resolve **before**
  the installer runs, because the certificates are fetched during the run.
- Open ports: **80/tcp and 443/tcp** (certificates and the site; also 443/udp for HTTP/3 in
  Caddy mode). With calls also **7881/tcp, 3478/udp, 5349/tcp and 50000–50499/udp**. Port 7880
  (LiveKit's signalling) stays closed: it is reached only through the proxy. In nginx mode LiveKit
  listens there on 127.0.0.1 only (since 2026-11-04, `LIVEKIT_BIND` in `deploy/calls/.env`); in
  Caddy mode on every address, because the site's Caddy container reaches it over the Docker
  bridge, so there the firewall alone keeps it closed.
- Ports 80 and 443 either free, or held by nginx (see "The two modes").
- Outgoing internet: Docker's and Ubuntu's package repositories, Docker Hub, the npm registry
  (the image is built on the server) and Let's Encrypt.

## The one command

On the server, get the code and run the installer as root, in one line:

```sh
git clone https://github.com/weudlll-cyber/seasonal-entertainment.git /opt/seasonal-entertainment && sudo /opt/seasonal-entertainment/deploy/install.sh
```

It needs git, which Ubuntu servers usually have; if not, `sudo apt-get install -y git` first.
Writing to `/opt` needs root: run it as root, or as `sudo git clone …` for the first half.
**The checkout must be root's** (since 2026-11-04): root runs its files, so the installer stops
at once, before anything changes, when the checkout or any folder above it is not owned by root
or is writable by its group or by others, and names that folder. A checkout cloned as another
user: `sudo chown -R root:root <checkout> && sudo chmod -R go-w <checkout>`, then run again. The
repository is public, so the clone needs no GitHub login on the server. Any folder works; the
installer remembers where it ran. After the questions, a run on a fresh server took about 6
minutes (first deployment), most of it installing Docker and building the image. It writes one
plain line per step (`[install] …`) and says before the long ones (installing Docker, building
the image, starting the call service) roughly how long they take. While a step runs longer than
15 seconds, a line `still working (m:ss): <step>` follows every 20 seconds, so a pause is never
silent; the output of apt and Docker is kept aside and shown (its last 25 lines) only when the
step fails. On any failure it stops, says what failed, and prints the command that undoes the
run (see "Rollback").

### What it asks

| Question                         | Answers-file key                                                      | Notes                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| The site's domain                | `SITE_DOMAIN`                                                         | e.g. `example.org`                                                                                     |
| Should www redirect to it?       | `WWW_REDIRECT`                                                        | `yes`/`no`; `www.example.org` then needs its own A record                                              |
| The call service's domain        | `CALLS_DOMAIN`                                                        | e.g. `calls.example.org`; empty: no calls (explained below)                                            |
| Record calls?                    | `RECORDING`                                                           | `yes`/`no`; only with calls (explained below; docs/CALLS.md, "Recording")                              |
| Email for Let's Encrypt          | `ACME_EMAIL`                                                          | certificate notices                                                                                    |
| The bots' files                  | `PRICE_BOT_DB`, `PRICE_BOT_MINING_RATES`, `EVENT_BOT_DB`              | paths on this server; empty: that data source stays off (docs/BOTS.md)                                 |
| The age public key for backups   | `BACKUP_RECIPIENT`                                                    | `age1…`; empty: add later with `--backups` (see "Backups")                                             |
| CoinGecko Demo API key           | —                                                                     | hidden, on a terminal, once; empty: no prices; later with `--coingecko`                                |
| Discord login                    | `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DISCORD_CLIENT_SECRET_FILE` | once; the secret from a file or typed hidden; empty: none; later with `--discord` ("Discord login")    |
| The event bot's admin page       | `BOT_ADMIN_URL`, `BOT_ADMIN_TOKEN_FILE`, `BOT_ADMIN_TOKEN_KEY`        | nginx mode only; empty: none, not asked again; later with `--bot-admin` ("The event bot's admin page") |
| Embedded games                   | `BINGO`, `MINI_GAMES` (yes/no)                                        | default no; each asked once; later with `--bingo`, `--mini-games` ("Embedded games")                   |
| The first admin's name and email | `ADMIN_NAME`, `ADMIN_EMAIL`                                           | asked at the end                                                                                       |
| The first admin's password       | —                                                                     | **always** typed on the terminal, shown as `*`; never from a file or flag                              |

Before the calls question, the installer explains on the terminal what calls are (voice and
video rooms on the site: a stage with up to 10 speakers and up to 200 listeners), what they need
(a second domain whose A record points at the server, the extra ports, about one CPU core per
busy call), and that an empty answer is the safe choice when unsure. Before "Record calls?" it
says the same for recording (organisers and admins record, everyone is told and must agree, up
to about 480 MB per recorded hour on the server and in the backups, about two more CPU cores (up
to three) while it runs; "no" when unsure). A question answered by the answers file or an earlier run is not asked,
and its explanation is not shown.

The password is typed with one `*` per character (backspace and Ctrl-U work). Before the
confirmation, the installer checks it against the site's own rules (`validatePassword` in
`shared/accountRules.js`: at least 10 characters, at most 72 bytes); a password that breaks
them, or a confirmation that differs, is explained and asked again, and the run goes on. The
password is never printed, logged or stored: it goes to `scripts/bootstrap-admin.mjs` on stdin.

For an unattended run, copy `deploy/install/answers.example` somewhere **outside** the checkout,
fill it in, and run `sudo ./deploy/install.sh --answers /root/answers.txt` (add `--yes` so it
never asks; the admin password is still typed when it gets there). The answers file holds no
secrets. Answers given once are remembered in `/etc/seasonal/install.conf` (root only, no
secrets), so a later run asks nothing it already knows.

The CoinGecko key is a secret: it is typed on the terminal (shown as `*`) and stored only in
`deploy/site/site.env`. It is asked once. An empty answer (Enter) is remembered as
`COINGECKO=none` in `install.conf` (the answer, never a key), so re-runs and `--update` do not
ask again. A run with `--yes` or without a terminal never asks and remembers nothing.

#### Changing an answer later

Run the installer again with an answers file that holds only the keys to change; the others come
from `/etc/seasonal/install.conf`. For example, to add calls later:

```sh
printf 'CALLS_DOMAIN=calls.example.org\nRECORDING=no\n' > /root/calls.txt
sudo ./deploy/install.sh --answers /root/calls.txt
```

An empty value in the file does not remove a remembered answer.

To set the CoinGecko key later (or change it), run `sudo ./deploy/install.sh --coingecko`: a
re-run that asks for the key again on the terminal. Enter there removes a stored key. It also
goes with `--update` (`--update --coingecko`), not with `--yes`.

To embed the event bot's admin page later, or change or remove it, run
`sudo ./deploy/install.sh --bot-admin`, or give its keys in an answers file ("The event bot's
admin page").

### What it does

1. Checks the system (Ubuntu 22.04/24.04) and what listens on ports 80 and 443, then decides the
   mode (next section).
2. Writes a **snapshot** of everything it may touch to `/var/backups/seasonal-install/<time>/`:
   a copy of `/etc/nginx`, the ufw rules, its own state, and the commit. It prints the rollback
   command.
3. Installs what is missing: curl, openssl, git, Docker Engine with the Compose plugin (from
   Docker's repository), and certbot in nginx mode. It never upgrades or removes other packages.
   apt runs with `NEEDRESTART_MODE=l`: Ubuntu's needrestart still scans the processes after an
   install (shown as "still working"), but only lists what would need a restart and never asks
   or restarts another service (another site's nginx, ssh) during the run; `sudo needrestart`
   shows the list later.
4. Makes every secret on the server: the session secret, the key that encrypts 2FA secrets, the
   bootstrap token, and the call service's key pair. Secrets are never printed. They are written
   to `deploy/site/site.env`, `deploy/site/.env` and `deploy/calls/.env` (mode 600, never
   committed). A secret that already exists is kept. When the key that encrypts 2FA secrets is
   made, the end of that run says once "KEEP SAFE" and how to copy it off the server (see "What
   you still do yourself"); later runs do not repeat it (`--help` always says it).
5. Firewall: if **ufw is active**, it adds only the rules the chosen features need **and no
   existing rule allows yet**, and lists them in `/etc/seasonal/ufw-added`. An existing rule
   counts when it lets the port in from anywhere: also a combined rule (`80,443/tcp`), a range
   (`50000:60000/udp`), a port without protocol (`7881`) or an app profile (`Nginx Full`). A
   rule limited to one source address, one interface or a rate (`limit`) does not count. IPv4
   and IPv6 are checked separately (ufw keeps them in `user.rules` and `user6.rules`): when only
   one of them is missing, only that one is added (e.g. `ufw allow to ::/0 port 5349 proto tcp`).
   A rule ufw already had is never counted as the installer's, and `--uninstall` removes exactly
   the ones listed. A rule in that list that other rules now cover is removed and taken off the
   list, with a line `firewall: removed …` (the installer of the first deployment, 2026-11-01,
   added `80/tcp` and `443/tcp` beside the server's own `80,443/tcp`; the next run removes those
   two, for IPv4 and IPv6). Only rules in the list are ever removed. If ufw is inactive, it enables nothing and
   prints the ports that must be open. It never changes SSH, users or rules it did not add.
6. Builds the site image with the commit, starts the site, and waits for
   `https://<site>/api/health` over HTTPS.
7. Starts the call service (and the recording add-on) and checks it answers on
   `https://<calls domain>`.
8. Creates the **first admin** with the password typed on the terminal. It then removes
   `BOOTSTRAP_TOKEN` and restarts the site. Log in at `https://<site>/login`; admins set up 2FA
   first.
9. With an age public key: sets up the nightly backup, runs one at once, and checks that it is an
   encrypted `.tar.age`. Every run does so (one backup per run); its line says "the first one"
   only when there was no backup yet, "a new one now" otherwise. The re-run of `--update` takes
   none: the update took its own before the new code ("Updating").

### The two modes

| On ports 80/443 | Mode      | What the installer does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| nothing         | **Caddy** | The site's own Caddy (`deploy/site/docker-compose.yml`) gets and renews the certificates and forwards both names. The calls certificate goes to LiveKit's TURN through `seasonal-calls-cert.timer`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| nginx           | **nginx** | Adds **only its own** files (`zz-seasonal-site.conf`, `zz-seasonal-calls.conf` in `sites-available`, linked into `sites-enabled`, or in `conf.d`; the names before 2026-11-01, `seasonal-site.conf` and `seasonal-calls.conf`, are moved to these on the next run). It never edits existing files, and it stops if another server block already claims one of its names. Certificates come from certbot by webroot (`seasonal-site`, `seasonal-calls`); an existing certbot setup and its renewal timer are reused. A deploy hook (`/etc/letsencrypt/renewal-hooks/deploy/seasonal.sh`) hands the renewed calls certificate to LiveKit and reloads nginx. The site listens on `127.0.0.1:3800` only, and Caddy is never started. |
| anything else   | —         | Stops with a message and changes nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

In nginx mode every change runs `nginx -t` before `systemctl reload nginx` (never a restart), and
a file that fails the test is put back as it was. Only the first run starts with port 80 alone
(certbot proves the names there); once the certificates exist, a re-run writes the full files at
once, so the site never loses HTTPS during an update.

The other sites keep answering for their own names, with their own certificates.

#### Unknown names stay with the other sites

Requests on 443 for **no known name** (by IP address, or without SNI) get the same answer after a
run as before it (`deploy/install/lib/nginx-default.sh`). nginx gives them to the
`default_server` of the address or, if no server is marked so, to the first server it loaded that
listens there; it reads a folder in name order. On the first deployment (2026-11-01) the old
`seasonal-calls.conf` sorted before the existing site's file and took those requests over. Now,
for IPv4 and IPv6 separately:

- **Another site has a `default_server` for 443**: it stays the answer; the installer's files
  never carry `default_server` then.
- **Other sites listen on 443, none marked `default_server`**: the installer's files are named
  `zz-seasonal-*.conf`, so they load after the other sites' files. Before every reload it reads
  the load order from `nginx -T`; if one of its servers would still come first on port 80 or 443
  (a file that sorts after `zz-`, or a server in `nginx.conf` itself), it puts its files back and
  stops: mark the server that should answer with `listen 443 ssl default_server;` in your own
  file and run it again.
- **No other site listens on 443** (nginx only on port 80, or only on IPv4 while the installer
  also listens on IPv6): before the run nothing answered TLS there. A server of the installer's,
  marked `default_server` with `ssl_reject_handshake on`, keeps it that way: such a request gets
  no certificate and no page. This needs nginx 1.19.4 or newer (Ubuntu 24.04 has 1.24). Ubuntu
  22.04's nginx 1.18 cannot reject a handshake: there the site's own server becomes the answer
  for unknown names, the installer says so in a warning, and the check below allows exactly that
  change (a self-signed catch-all instead would only trade one wrong certificate for
  another).

After every reload the installer compares the certificate nginx shows without SNI
(`openssl s_client -connect 127.0.0.1:443 -noservername`, and `[::1]:443` with IPv6) with the
one before the run. If it changed, the previous files come back, nginx reloads, and the run stops
with both fingerprints. On a re-run of a server installed before 2026-11-01, where the old calls
file was the answer, any other answer is the fix and passes (the load-order check has made sure
it is no longer one of the installer's files where other sites listen).

#### Unknown names: a catch-all

An option for the server, not part of the installer (decided 2026-11-02, in use on the owner's
server since then): unknown names get **no answer at all** instead of the distribution's welcome
page on port 80 or another site's certificate on 443. `deploy/nginx/catch-all.conf` is one server
marked `default_server` on port 80 (IPv4 and IPv6) and port 443 (IPv4): `return 444` closes the
connection, and on 443 `ssl_reject_handshake on` refuses the handshake before a certificate is
shown (nginx 1.19.4 or newer). IPv6 443 is left to the installer, which makes such a server there
itself where no other site listens.

```sh
tar czf /root/etc-nginx-before-catch-all.tar.gz -C / etc/nginx    # to go back
install -m 644 /opt/seasonal-entertainment/deploy/nginx/catch-all.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/catch-all.conf /etc/nginx/sites-enabled/catch-all.conf
rm /etc/nginx/sites-enabled/default    # the link only; sites-available/default stays
nginx -t && systemctl reload nginx     # never a restart
```

Then every site must answer as before (status, redirect, certificate), and
`curl -H 'Host: unknown.invalid' http://127.0.0.1/` must end with "Empty reply from server". If
`nginx -t` reports a duplicate default server for `0.0.0.0:443`, the installer already refuses
unknown names there (no other site on 443): drop the `listen 443` line. The installer accepts the
catch-all: it counts as another site on 443, keeps out of its way, and its check of the answer for
unknown names compares with no answer before and after (the installer tests' nginx scenario adds
it before `--update`).

### Discord login

Members log in with Discord and show their steps from the Seasonal Tokens Discord server
(docs/AUTH.md, "Discord"). It is optional: without it, the site has no Discord button and
everything else works.

**At Discord** (the Developer Portal, the application's OAuth2 page):

- **Redirects**: exactly `https://<your domain>/api/auth/discord/callback`. Discord compares it
  character for character. Type it, don't paste it: on 2026-11-02 the entries carried three
  invisible leading spaces, and every login failed with "Invalid OAuth2 redirect_uri" until they
  were typed again. To check, choose that redirect in the portal's URL generator: the URL it
  builds must contain `redirect_uri=https%3A...` with no `+` before it.
- **Public client**: off (the server keeps the secret).
- No bot is needed, and none should be added to the Seasonal Tokens server: the site reads a
  member's roles with their own consent (scope `guilds.members.read`).
- Worth setting: the links to the terms and the privacy page (shown on Discord's consent page).

**On the server**: the installer asks once, on a terminal, after the CoinGecko key:

- the application's **client id** (Enter: no Discord login; remembered as `DISCORD=none` and not
  asked again);
- the **Seasonal Tokens server's id** (default `902220302199689266`);
- the **client secret**: the path of a file holding it, or typed hidden (`*`). It is stored only
  in `deploy/site/site.env` (mode 600) and never shown or logged. A file is the safer way (no
  terminal history); delete that file afterwards.

The answers file takes `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` and `DISCORD_CLIENT_SECRET_FILE`
(the secret itself never goes into it). To add, change or remove it later, run
`sudo ./deploy/install.sh --discord`; Enter at the client id there removes the settings. It also
goes with `--update` (`--update --discord`), not with `--yes`. The site then reads
`DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` and `DISCORD_CLIENT_SECRET`; the redirect it sends to
Discord is `PUBLIC_ORIGIN` + `/api/auth/discord/callback` (docs/ARCHITECTURE.md, "Runtime
configuration").

The steps ship with their role ids and icons (`server/src/discord/seed/`, inserted on the first
start into a database that never had steps); Admin → Discord steps changes them.

### The event bot's admin page

The owner's event bot (`stannouncebot`) has its own admin page for its events. In nginx mode the
installer can show it inside the site ("Manage events", `https://example.org/manage-events`; the
bot's page itself at `/bot-admin/admin`), for organisers and
admins, with their site login and no second login (decided 2026-10-20; organisers may manage
events, decided 2026-11-01). The site's side of it (who counts as staff, the page that embeds it,
the audit entries) is in docs/BOTS.md.

**The question.** In nginx mode the installer explains it on the terminal and asks for the bot's
admin page address on this server: `http://127.0.0.1:<port>` or `http://[::1]:<port>` (loopback
only: the bot takes its token only from this server itself); `yes` means
`http://127.0.0.1:8090`. Empty means none: remembered as `BOT_ADMIN_URL=none` in
`/etc/seasonal/install.conf` and not asked again, as the CoinGecko answer is. Then where the
bot's admin token comes from: the bot's env file (`KEY=VALUE` lines) and the token's key in it
(`STANNOUNCEBOT_WEB_ADMIN_TOKEN` by default), or, with an empty file answer, the token typed on
the terminal (shown as `*`). Answers-file keys: `BOT_ADMIN_URL`, `BOT_ADMIN_TOKEN_FILE`,
`BOT_ADMIN_TOKEN_KEY` (the token itself never goes into an answers file). A run with `--yes` or
without a terminal never asks and remembers nothing. In Caddy mode it is not asked; the run says
that it works in nginx mode only.

```sh
printf 'BOT_ADMIN_URL=http://127.0.0.1:8090\nBOT_ADMIN_TOKEN_FILE=/path/to/the/bot.env\nBOT_ADMIN_TOKEN_KEY=STANNOUNCEBOT_WEB_ADMIN_TOKEN\n' > /root/bot-admin.txt
sudo ./deploy/install.sh --answers /root/bot-admin.txt
```

`sudo ./deploy/install.sh --bot-admin` asks the question again (also after "none"); Enter there
removes the page. It also goes with `--update`, not with `--yes`. `BOT_ADMIN_URL=none` in an
answers file removes it too.

**In the bot's env file** (the owner sets these; the installer never touches the bot, its files
or its env file): `STANNOUNCEBOT_WEB_EMBEDDED=1` and `STANNOUNCEBOT_WEB_BASE_PATH=/bot-admin`,
then restart the bot. Its page and API then live under `/bot-admin/` on 127.0.0.1:8090. Until
they do, the installer warns that the bot does not answer on `…/bot-admin/health`.

**The token.** Read from the one key of the bot's env file, which is never executed (only that
line is taken; nothing from the file is printed), or typed. The file is read as systemd's
`EnvironmentFile=` reads it, since that is the value the bot compares: surrounding `"…"` or
`'…'` removed (inside `"…"`, `\"`, `\\`, `` \` `` and `\$` stand for the character), a CR at
the line's end and spaces after an unquoted value dropped, a `#` inside the value kept, and a
line `export KEY=…` ignored (systemd ignores it; an unclosed quote stops the run). Checked
against systemd 255 by `deploy/test/bot-admin-token.test.sh`.
The token goes into nginx's configuration between double quotes, where any printable ASCII
character is taken as it is (`; { } # '` and spaces included) except `"`, `$` and `\`. Those,
control characters, characters outside ASCII (they would reach the bot changed), a space at
either end and more than 1024 characters are refused before a change. The bot's token then has
to be replaced: a new one of letters and digits (for example `openssl rand -hex 32`) under the
same key in the bot's env file, the bot restarted, the installer run again.
It is written only to `/etc/seasonal/bot-admin-token.conf` (root:root, mode 600, made with
`umask 077` and moved into place in one step), as one `proxy_set_header X-Bot-Admin-Token "…";`
line that nginx includes. It is never printed, never in `install.conf`, `site.env`, the site's
nginx file or a snapshot. A token read from a file is read again on every run (a new token in
the bot's file takes effect with the next run); a typed one stays in the include until
`--bot-admin` or `--uninstall`.

**How a request goes.** The site's server file (`zz-seasonal-site.conf`) gets two locations,
only while the page is set up (`deploy/install/lib/bot-admin.sh`):

- `location /bot-admin/`: nginx first makes an `auth_request` to the internal location
  `/_seasonal_bot_admin_auth`, which asks the site (`GET /api/bot-admin/authorize` on
  127.0.0.1:3800) with the visitor's cookie, `Origin`, `X-Original-Method` and `X-Original-URI`
  (no body). The site answers 204 with `X-Acting-User: <username>` for staff, 401 for a guest and
  403 for anyone else or a cross-origin change; nginx passes 401 and 403 to the visitor as they
  are, and the bot never sees those requests.
- With 204 the request goes to the bot, path unchanged (`/bot-admin/…`), with `Host`,
  `X-Forwarded-Proto: https`, `X-Acting-User` from the site's answer and the token from the
  include. What the visitor sent as `X-Bot-Admin-Token` or `X-Acting-User` never reaches the bot:
  both are always replaced. `X-Forwarded-For`, `X-Real-IP` and `Forwarded` are dropped, so a bot
  that trusts a proxy still sees the request coming from 127.0.0.1, the only address it takes
  the token from. `Cookie` is dropped too: the bot logs in by the token on every request, and
  the visitor's cookies (the site's session among them) stay with the site.
- The bot's answers leave with the site's own rules (since 2026-11-04), whatever the bot sent of
  them: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
  `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'`, each
  `always` (error answers too). The page runs on the site's origin, so only the site's own pages
  may frame it, as `/manage-events` does. No script or style policy: that could break the bot's
  page. The site's server block has no `add_header` of its own; one added there must be added to
  this location too, since nginx drops a server's `add_header` in a location that has its own
  (`deploy/test/server-hardening.test.sh` checks it).

Every change runs through the usual `nginx -t`, load-order check, reload and comparison of the
answer for unknown names; a re-run keeps both locations. nginx logs no request headers with its
default `combined` log format and error log level, and the installer sets no other: keep it so
(a `log_format` with `$http_x_bot_admin_token` or `error_log … debug` would write the token to
the logs). `site.env` gets `BOT_ADMIN_EMBEDDED=1` while the page is set up (removed otherwise),
and the site restarts with it.

**Caddy mode** is not built. It would need: a `forward_auth` to the site's
`/api/bot-admin/authorize` (with `X-Original-Method` and `X-Original-URI`, copying
`X-Acting-User` from its answer) before a `reverse_proxy` to the bot; the bot reachable from the
Caddy container (its admin page listening on an address of the Docker network, or Caddy on the
host network); the Caddy container's address in the bot's trusted-proxy and allowed-address
list, since the bot takes the token only from allowed addresses; and the token header added by
Caddy from a root-only file mounted into the container, never in the Caddyfile in the
repository.

### Embedded games

Game developers: [GAME-INTEGRATION.md](GAME-INTEGRATION.md) brings together the website
contracts, game-side requirements and acceptance checklist.

Two games can run inside this site, each its own project with its own installer (decided
2026-11-04): Seasonal Bingo Royale at `https://<site domain>/games/bingo` and Seasonal Mini Games at
`https://<site domain>/games/mini-games`. Players sign in there with this site's login
(docs/AUTH.md, "Embedded games"), and each game shows this site's chat in its own room
(docs/EMBED.md). This installer only prepares the site (`deploy/install/lib/games.sh`); each
game's installer writes its own route file and never edits this site's files.

- **The questions**, one per game, default no, each asked once on a terminal and remembered in
  `install.conf`:

  | Question                                                     | Answer key   | Asks again     |
  | ------------------------------------------------------------ | ------------ | -------------- |
  | "Will Seasonal Bingo Royale be embedded at /games/bingo?"    | `BINGO`      | `--bingo`      |
  | "Will Seasonal Mini Games be embedded at /games/mini-games?" | `MINI_GAMES` | `--mini-games` |

  `sudo ./deploy/install.sh --bingo` or `--mini-games` asks that one again, also with `--update`
  (not with `--yes`); `BINGO=yes|no` and `MINI_GAMES=yes|no` in an answers file. An unattended
  run never asks and keeps what was remembered (no when nothing was).

- **An install from before Mini Games** (`BINGO` remembered, no `MINI_GAMES`): `--update` on a
  terminal asks the Mini Games question once; an unattended one keeps Bingo as it was and
  remembers Mini Games as no. Nothing else to do.
- **With any game yes**: the games' sync token is made once, 64 hex characters, in
  `/etc/seasonal/games-sync-token` (root, mode 600, never printed or logged; kept on every later
  run; one token for all games), and `site.env` gets `GAMES_EMBEDDED` (the games answered yes,
  e.g. `bingo,mini-games`) and `GAMES_SYNC_TOKEN` (its value). With both no, neither; the games'
  routes then answer 404. `GAMES_BINGO_EMBEDDED`, written by installs from before the list, is
  removed (the site still reads it as "bingo is in the list"). Each game's installer reads the
  token from that file and sends it as `X-Games-Sync-Token` to the account-changes feed.
- **nginx mode**: the site's server block (its domain's, on 443) holds exactly
  `include /etc/seasonal/routes/*.conf;`, and the folder `/etc/seasonal/routes/` (root, 755) is made
  on every run if missing. Each game's installer puts its file there (it holds a proxy secret,
  mode 600). This installer never reads, logs, copies, backs up or removes files in it; `nginx -t`
  passes with the folder empty, and a broken file there makes the usual check fail before a
  reload. The same server block denies every game's feed, `/api/games/bingo/account-changes` and
  `/api/games/mini-games/account-changes` (`deny all`, 403), whether the game is on or not: a game
  reads its feed over the site's local port, `http://127.0.0.1:<port>`, the port in
  `/etc/seasonal/site-local-port` (root, 644; written on every run, 3800).
- **Own-Caddy mode**: the site block of `deploy/site/Caddyfile` has
  `import /etc/caddy/routes/*.caddy`, and `deploy/site/routes/` is mounted there (kept in git by
  its `.gitkeep`; anything else in it is ignored by git). Both feeds answer 404 there. The site's
  port is not published on the host in this mode, so no port file is written: a game reaches the
  feed only from the site's Docker network (`http://site:3800`).
- Tests: `bash deploy/test/games.test.sh` (CI too; with Docker it also runs the real nginx and
  the site's Caddy).

### What you still do yourself

- **DNS records** (see "Requirements").
- **A provider firewall**, if your host has one in front of the server: open the same ports
  there. The installer prints them.
- **Copy the 2FA encryption key off the server**, right after the first run (its end says
  "KEEP SAFE" once; `sudo ./deploy/install.sh --help` says it any time). Store it apart from
  the backups: without it, 2FA logins cannot be restored onto a new server (docs/AUTH.md). From
  your PC:

  ```sh
  scp root@<server>:/etc/seasonal/secret-encryption-key ./seasonal-secret-encryption-key
  ```

  On Linux or macOS, keep it readable for you only (step 5 of "Linux and macOS" below).

- **Keep the age private key safe.** It is the only way to read the backups. Keep it on your PC
  plus one offline copy, and never on the server ("Backups to your PC").
- SSH hardening (keys only, no root login) is your decision. The installer does not touch SSH.
  The reference section shows the usual steps.

## Updating

```sh
sudo /opt/seasonal-entertainment/deploy/install.sh --update
```

`--update` (`deploy/install/lib/update.sh`) does, in this order:

1. Checks that the checkout can simply move forward, and stops with the reason, having changed
   nothing, if it cannot: tracked files are modified, the checkout has commits origin's default
   branch does not have (diverged), it is on another branch, or origin's default branch is
   unknown. It never resets, stashes or discards anything; fix such a checkout by hand.
2. With backups set up, takes a fresh backup and prints where it is
   (`/var/backups/seasonal/<time>.tar.age`). This is the update's only backup: the re-run in
   step 4 names it instead of taking a second one. Without backups set up, it makes a local copy
   of the database and the media folder instead (decided 2026-11-04,
   `deploy/install/lib/update-copy.sh`): the same backup code inside the running site, not
   encrypted, into `/var/backups/seasonal-update-copies/<time>/`, owned by root and readable
   only by root, the newest three kept. The site writes it inside its container (`/tmp`), and the
   installer fetches it as root with `docker compose cp` (since 2026-11-04): it never lies in a
   host folder of the container's user, uid 1000, which on a server may be a login account. It prints where the copy is. A failed copy stops the
   update before anything changed. To go back to it: `restore.mjs` takes the folder as it
   takes an unpacked backup (copy it under `/var/backups/seasonal/` first, "Restoring").
3. Fetches and fast-forwards the checkout to origin's default branch (`master`), also from a
   detached checkout left by `--commit`, and prints the old and the new commit.
4. Runs **that** commit's installer as a plain re-run: no questions for remembered answers; it
   rebuilds the image and restarts what changed. The CoinGecko key is asked only if it was never
   answered (Enter: none, then never again); `--update --coingecko` asks it again,
   `--update --yes` never asks.

An older installer, such as the first deployment's (2026-11-01), does not tell the new one that
it took the backup, so the first `--update` from it still ends with a second backup; later ones
take one.

For a specific version instead, `sudo ./deploy/install.sh --commit <tag or commit>` checks out
the ref and runs that commit's installer the same way (take a backup first:
`sudo systemctl start seasonal-backup.service`). `--update` and `--commit` do not go together.

A server installed before `--update` existed has an installer without it. The first time:

```sh
cd /opt/seasonal-entertainment && git pull --ff-only && sudo ./deploy/install.sh --update
```

Secrets, data, certificates and answers are kept. The site is down for the few seconds the
container needs to start. Chat connections reconnect by themselves, and running calls continue
when only the site changes. Database changes are additive (added on start).

### Dependency updates

New versions of what the site is built from arrive as pull requests from Renovate (the GitHub
app, installed 2026-11-10; configuration `renovate.json`, modelled on the game repositories).
Nothing reaches the server by itself: every update PR needs the owner's approval to merge
(master is protected, and its checks must pass), and the server gets it only with the next
`--update`.

- **Weekly**: one PR, "minor and patch updates", gathers every non-major update, digest and pin
  of the week; a new version waits 3 days first. A major update comes as its own PR.
- **Security fixes** come at once, labelled `security`, without the wait.
- **What it covers**: the npm dependencies (pinned to exact versions), the GitHub Actions
  (pinned to commit SHAs), the images in `deploy/` (the Dockerfile's `NODE_IMAGE`, the compose
  files' LiveKit, egress, Redis and Caddy, by tag and digest), the CI's scanner images and
  shellcheck, and the LiveKit binary of the browser tests (`scripts/calls-binary.mjs`).
- **LiveKit** comes as its own PR, "LiveKit server": the server image and the browser tests'
  binary move together. Renovate changes the binary's version but cannot know its SHA-256
  values, so that PR's CI fails until the three checksums in `scripts/calls-binary.mjs` are
  updated from LiveKit's release (the download is checked against them).
- `deploy/test/renovate.test.sh` (CI) checks that the configuration still finds those pins.
- Not covered: the load test's `livekit-cli` image (`deploy/calls/loadtest.sh`), pinned by digest
  only; it is updated by hand when needed.

### What visitors see

A page that was open during the update keeps working and never reloads by itself in the middle
of something (decided 2026-11-01):

- It shows **"A new version of this site is available."** with a **Reload** button at the top of
  the main column (`client/src/app/UpdateNotice.jsx`), and the embedded chat (docs/EMBED.md)
  shows **"A new version of the chat is available."** the same way at its top (since 2026-11-02;
  in a frame on another site "this site" would be that site), once `/api/health` reports another
  commit than the one the page was built from. The page asks every 5 minutes while its tab is visible
  (one small request; a hidden tab does not ask) and at once when its chat connection is back
  after the restart, so a signed-in visitor usually sees it within seconds.
- A part of the site loaded on first use (call page, prices, info pages, admin, embedded chat)
  whose file is gone after the update: the page reloads once by itself and opens it. Fails it
  again within a minute of that reload, the page says "This part of the page could not be
  loaded." with a Reload button instead of staying blank (`client/src/app/staleChunks.js`).
- A request made while the site is restarting (no connection, or nginx's 502/503/504 page): the
  page says "The server did not answer. Please try again in a moment." instead of a bare
  "Request failed." (`NO_ANSWER`, `client/src/api/http.js`, since 2026-11-04); every message
  the site itself sends is shown as it is.

The build commit comes from the same place as the server's: the image is built with
`--build-arg COMMIT_SHA` (the installer passes it), outside Docker from `git`
(`client/vite.config.js`, `server/src/buildInfo.js`). A build without either (`unknown`) never
shows the notice.

**Seeing the notice on your PC**: `npm run dev` has no build commit, so it never shows the notice
there. To see it, start it with a pretended one, which differs from the server's real commit:

```powershell
$env:SE_DEV_BUILD_COMMIT = 'test'; npm run dev     # sh: SE_DEV_BUILD_COMMIT=test npm run dev
```

(or `SE_DEV_BUILD_COMMIT=test` in `.env`). Open http://localhost:5380, sign in (so the chat
connection is open) and save any file in `server/src`: the server restarts, the connection comes
back and the notice shows within seconds; without that, after 5 minutes. The production shape
shows it too: `npm run build`, `npm start`, open http://localhost:3800, then make a commit and
restart `npm start` without building again.

## Status, uninstall, rollback

```sh
sudo ./deploy/install.sh --status       # mode, names, commit, containers, health, certificates, timers, backups
sudo ./deploy/install.sh --uninstall    # removes what the installer added
sudo ./deploy/install.sh --uninstall --purge-data   # also deletes the site's data (type the site name to confirm)
sudo ./deploy/install.sh --rollback /var/backups/seasonal-install/<time>
```

- `--uninstall` removes the containers, the installer's nginx files (then `nginx -t` and a
  reload; with them the event bot's admin page locations), the bot's token include
  `/etc/seasonal/bot-admin-token.conf` and `BOT_ADMIN_EMBEDDED` in `site.env`, the ufw rules it
  added, its timers and the certbot hook. The remembered answers stay: installing again reads the
  token from the bot's env file again (a typed token is asked again). It **keeps** the data (Docker
  volume `seasonal-site_site-data`), the backups, the secrets and the certificates. Installing
  again reuses all of them.
- `--purge-data` also deletes the data volume and the remembered answers. Backups, secrets and
  certificates still stay.
- `--rollback` puts the installer's nginx files, its ufw rules, its state and the commit back as
  they were in that snapshot (the bot's token include and `BOT_ADMIN_EMBEDDED` follow the nginx
  files: removed when they have no bot locations, written from the bot's env file named in the
  snapshot's answers when they have and it is missing) (a redundant rule the run removed is not added again: the other
  rule still opens the port). Then run the installer again to rebuild at that commit. Older code
  runs on a newer database (changes are additive); if an update ever changed data in a way the
  old code cannot read, restore the backup taken before it ("Restoring").

### Logs without secrets

Two kinds of request carry a secret in their query: Discord's one-time `code` and `state` on
`/api/auth/discord/callback`, and a file link's signature (`?link=`, valid 5 minutes) under
`/api/chat/files/`. Both are logged without the query (since 2026-11-04): in nginx mode their
two locations write `access.log` in the format `seasonal_no_query` (the distributions'
`combined`, with the path in place of the whole request line); in Caddy mode a `request>uri`
filter cuts the query from those two paths in both logs (`deploy/site/Caddyfile`). Every other
request is logged as before. The embed and guest tokens never reach the logs either (docs/EMBED.md).

## Backups

Every night at 03:30 `seasonal-backup.timer` runs `scripts/backup.mjs` inside the site container
(`server/src/backup/`):

- The database is copied through **SQLite's online backup API**, which stays consistent while the
  site runs, and is checked with `PRAGMA integrity_check`. The media folder is copied too,
  **without the call recordings**, together with a `manifest.json`.
- **The call recordings are backed up once each** (decided 2026-11-11; an hour of recording is
  about 450 MB, which every nightly archive would otherwise carry 14 times over): right after
  the archive, on the same timer, every finished recording without a backup yet is encrypted to
  the same key into `/var/backups/seasonal/recordings/<file>.age`
  (`server/src/backup/recordings.js`). A file already backed up is not touched again, unless it
  changed after its backup (then once more). A recording still being recorded waits for the
  next night, so every recording is in a backup after the first nightly run after it ended
  (none waits longer). A recording deleted on the site keeps its backup for **14 days**, like
  the archives (a `<file>.age.gone` mark notes when it was first missed), then it goes. The
  run's log line counts them: new, again, kept, still recording, removed.
- **Encrypted** with age to your **public** key (decision rule of 2026-10-19). Only
  `/var/backups/seasonal/<UTC time>.tar.age` stays on the server. The private key exists only on
  your PC, so neither the server nor anyone who takes the files from it can read them.
- A backup counts only once complete (`….partial` until then). Backups older than **14 days** are
  deleted, but only after a new one is complete.
- The folder `/var/backups/seasonal` is **750** (since 2026-11-04; every run sets it, so an older
  755 one is fixed): owned by uid 1000, the site container's user that writes the backups; its
  group is the read-only backup user's below (`seasonal-backup`) when that user exists, otherwise
  root's. Nobody else may even list it. A backup user made after the installer ran: run the
  installer again (or `sudo chgrp seasonal-backup /var/backups/seasonal`).
- The backups hold the whole database (2FA secrets encrypted with `SECRET_ENCRYPTION_KEY`, which
  is **not** in them; direct messages only as ciphertext).

To set up or change the key later: `sudo ./deploy/install.sh --backups`. The installer asks for
the `age1…` key, enables the timer, runs one backup and checks it.

### Backups to your PC

On a Windows PC, once (all commands are PowerShell; `deploy/pc/` holds the scripts). Linux and
macOS follow below; the server side (step 2) is the same for all three.

The PC scripts also fetch the recordings' own backups into `<your backup folder>\recordings`
(`recordings/` on Linux and macOS): each one that is not there yet or has another size; they
are never deleted on the PC, also not when the server lets one go.

**1. The age key pair.** Install the age tool, version **1.2.1** (the version the encryption is
checked against): `winget install --id FiloSottile.age --version 1.2.1`. Or download
`age-v1.2.1-windows-amd64.zip` from `https://github.com/FiloSottile/age/releases` and put
`age.exe` and `age-keygen.exe` on your PATH. Then:

```powershell
New-Item -ItemType Directory -Force "$HOME\SeasonalBackupKey" | Out-Null
age-keygen -o "$HOME\SeasonalBackupKey\backup-key.txt"   # prints "Public key: age1…"
```

The **public key** (`age1…`) is the installer's backup answer. The **private key file** stays on
this PC, **not** in the backup folder and **never** on the server. Keep a second copy offline as
well (a USB stick, or a password manager's secure note).

**2. A read-only backup user on the server** (as root). It may only read the backup folder over
sftp: no shell, no writing, nothing else.

```sh
useradd --system --create-home --shell /usr/sbin/nologin seasonal-backup
install -d -o root -g root -m 755 /srv/backup-chroot /srv/backup-chroot/backups
echo '/var/backups/seasonal /srv/backup-chroot/backups none bind,ro 0 0' >> /etc/fstab
systemctl daemon-reload && mount /srv/backup-chroot/backups
cat > /etc/ssh/sshd_config.d/20-seasonal-backup.conf <<'CONF'
Match User seasonal-backup
    ChrootDirectory /srv/backup-chroot
    ForceCommand internal-sftp -R
    AllowTcpForwarding no
    X11Forwarding no
    PasswordAuthentication no
CONF
sshd -t && systemctl reload ssh
```

**3. Its SSH key**, made on the PC without a passphrase (the task runs unattended, and the account
can only read encrypted files):

```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\seasonal-backup" -N '""' -C seasonal-backup
Get-Content "$HOME\.ssh\seasonal-backup.pub"
```

On the server, put that line into `/home/seasonal-backup/.ssh/authorized_keys` (folder mode 700
and file mode 600, both owned by `seasonal-backup`).

**4. The first run by hand.** Copy `deploy\pc\` (three files) to e.g.
`$HOME\SeasonalBackupTools`. Connect once so Windows knows the host key, then fetch:

```powershell
sftp -i "$HOME\.ssh\seasonal-backup" seasonal-backup@example.org     # "yes", then: ls /backups, bye
& "$HOME\SeasonalBackupTools\Get-SeasonalBackups.ps1" -Server example.org -KeyFile "$HOME\.ssh\seasonal-backup"
```

It fetches every backup the PC does not have yet, into `$HOME\SeasonalBackups`. It keeps the
newest 30 there (`-Keep`) and logs each run to `download.log`. Run before the server's first
night, it finds none yet: it logs "server has 0 backups, 0 new" and succeeds.

**5. The daily task** (09:00; "run as soon as possible after a missed start" covers a PC that was
off):

```powershell
$script = "$HOME\SeasonalBackupTools\Get-SeasonalBackups.ps1"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
  "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Server example.org " +
  "-KeyFile `"$HOME\.ssh\seasonal-backup`"")
$trigger = New-ScheduledTaskTrigger -Daily -At 09:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName 'Seasonal backups' -Action $action -Trigger $trigger -Settings $settings
```

Check with `Get-ScheduledTaskInfo -TaskName 'Seasonal backups'` (`LastTaskResult` 0 = fine) and
`Get-Content "$HOME\SeasonalBackups\download.log" -Tail 10`.

#### Linux and macOS

The same, with a shell (`deploy/pc/get-seasonal-backups.sh` does what `Get-SeasonalBackups.ps1`
does: the same sftp user and key, every missing backup fetched as `.partial` first, the newest
30 kept, each run logged to `download.log`, exit code 1 when something failed).

**1. age 1.2.1** from the release tarball, so the version is exactly the one the encryption is
checked against (distribution packages are often older; Homebrew's `brew install age` gives the
newest, which reads the same files). Pick `linux-amd64`, `linux-arm64`, `darwin-arm64` (Apple
silicon) or `darwin-amd64` (Intel Mac):

```sh
curl -fsSLO https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-linux-amd64.tar.gz
tar -xzf age-v1.2.1-linux-amd64.tar.gz
sudo install -m 755 age/age age/age-keygen /usr/local/bin/
age --version                      # v1.2.1
```

**2. The key pair** (the private key file is written readable for you only):

```sh
mkdir -p ~/SeasonalBackupKey && chmod 700 ~/SeasonalBackupKey
age-keygen -o ~/SeasonalBackupKey/backup-key.txt     # prints "Public key: age1…"
```

As on Windows: the public key is the installer's backup answer, the private key file stays on
this PC (plus one offline copy), never in the backup folder and never on the server. The backup
user on the server is the same (step 2 above).

**3. Its SSH key** without a passphrase, then the first run by hand. Put the `.pub` line into the
server's `/home/seasonal-backup/.ssh/authorized_keys` as in step 3 above, and copy the script:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/seasonal-backup -N '' -C seasonal-backup
cat ~/.ssh/seasonal-backup.pub
mkdir -p ~/SeasonalBackupTools
install -m 755 deploy/pc/get-seasonal-backups.sh ~/SeasonalBackupTools/
sftp -i ~/.ssh/seasonal-backup seasonal-backup@example.org     # "yes", then: ls /backups, bye
~/SeasonalBackupTools/get-seasonal-backups.sh --server example.org --key-file ~/.ssh/seasonal-backup
```

It fetches into `~/SeasonalBackups` (`--local-dir`), keeps the newest 30 (`--keep`) and logs to
`~/SeasonalBackups/download.log` (`--log-file`).

**4. Check that one decrypts** (the list ends with the database):

```sh
newest="$(ls ~/SeasonalBackups/*.tar.age | tail -n 1)"
age -d -i ~/SeasonalBackupKey/backup-key.txt "$newest" | tar -tf - | grep '/seasonal.db$'
```

**5. The 2FA encryption key** ("What you still do yourself"), readable for you only and apart
from the backups:

```sh
mkdir -p ~/SeasonalSecrets && chmod 700 ~/SeasonalSecrets
scp root@example.org:/etc/seasonal/secret-encryption-key ~/SeasonalSecrets/secret-encryption-key
chmod 600 ~/SeasonalSecrets/secret-encryption-key
```

**6. The daily run.** On **Linux**, with cron (`crontab -e`, one line):

```sh
0 9 * * * $HOME/SeasonalBackupTools/get-seasonal-backups.sh --server example.org --key-file $HOME/.ssh/seasonal-backup >/dev/null 2>&1
```

cron skips a run while the PC is off; the next run fetches everything missed (the server keeps
14 days). On **macOS**, a launchd agent also runs a missed start once the Mac wakes from sleep.
Save this as `~/Library/LaunchAgents/seasonal-backups.plist`, with your home folder in place of
`/Users/you`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>seasonal-backups</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/you/SeasonalBackupTools/get-seasonal-backups.sh</string>
    <string>--server</string><string>example.org</string>
    <string>--key-file</string><string>/Users/you/.ssh/seasonal-backup</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
</dict>
</plist>
```

```sh
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/seasonal-backups.plist
```

(cron works on macOS too, with the Linux line.) Check with
`tail -n 10 ~/SeasonalBackups/download.log`: each run ends with `done`, or with `RUN FAILED` and
the reason.

### Restoring

From a backup on the PC (only the PC can open them):

```powershell
age -d -i "$HOME\SeasonalBackupKey\backup-key.txt" -o "$HOME\restore.tar" "$HOME\SeasonalBackups\<time>.tar.age"
scp "$HOME\restore.tar" root@example.org:/var/backups/seasonal/restore.tar
```

On Linux or macOS:

```sh
age -d -i ~/SeasonalBackupKey/backup-key.txt -o ~/restore.tar ~/SeasonalBackups/<time>.tar.age
scp ~/restore.tar root@example.org:/var/backups/seasonal/restore.tar
```

The recordings come from their own backups: decrypt each into one folder and copy it over
(PowerShell; on Linux and macOS the same with `age -d` in a loop and `scp -r`):

```powershell
New-Item -ItemType Directory "$HOME\restore-recordings" | Out-Null
Get-ChildItem "$HOME\SeasonalBackups\recordings\*.age" | ForEach-Object {
  age -d -i "$HOME\SeasonalBackupKey\backup-key.txt" -o "$HOME\restore-recordings\$($_.BaseName)" $_.FullName }
scp -r "$HOME\restore-recordings" root@example.org:/var/backups/seasonal/restore-recordings
```

On the server:

```sh
cd /opt/seasonal-entertainment/deploy/site
docker compose run --rm --no-deps site node scripts/restore.mjs /backups/restore.tar --check
docker compose stop site
docker compose run --rm --no-deps site node scripts/restore.mjs /backups/restore.tar --force \
  --recordings /backups/restore-recordings
docker compose start site
sudo /opt/seasonal-entertainment/deploy/install.sh --update   # sets the recordings folder's rights again
rm -r /var/backups/seasonal/restore.tar /var/backups/seasonal/restore-recordings   # plain copies go
```

Then delete `restore.tar` and `restore-recordings` on the PC too.

- `--check` verifies the checksum, the SQLite integrity and the media count, and touches
  nothing.
- **The recordings**: after the database, every finished recording the restored database names
  is put back from `--recordings` (`restoreRecordings`, `server/src/backup/restore.js`); one in
  place already is kept (an archive from before 2026-11-11 still holds them). Each recording with
  no file anywhere is named ("MISSING recording …") and the restore ends with exit code 1, never
  silently. Bring the missing ones and run the same command again, or accept the gap.
- **Deleted accounts stay deleted** (decided 2026-11-02): every account deleted after the backup
  was taken is deleted again right after the restore, with its messages and files, exactly as the
  site deletes one. The site notes each deletion (account id, username, time; nothing else) in
  `/data/account-deletions.jsonl` in the site's volume (`DELETION_JOURNAL`), which no backup
  contains and which keeps 30 days. The restore names each account it deleted again
  ("deleted again: account 12 (mia), deleted …"), or says no account was deleted after the
  backup. An account found under the same id but another name is a different one and stays; the
  restored site's last admin is never deleted ("NOT deleted again: … the last admin of the
  restored site"). **On a new server** the journal is not there yet: copy
  `account-deletions.jsonl` from the old server's volume `seasonal-site_site-data` (its path:
  `docker volume inspect seasonal-site_site-data --format '{{ .Mountpoint }}'`) into the new
  one before the restore, or the accounts deleted after the backup come back.
- Without `--force` the restore refuses existing data. A new server always has some: the first
  start creates the starting content. With `--force` the current database and media are moved
  aside to `….before-restore-<time>` in the volume, never deleted. Delete those once the restored
  site looks right.
- **On a new server**, put the old `SECRET_ENCRYPTION_KEY` (the copy you took off the old
  server) into `deploy/site/site.env` before the restore and restart the site. Otherwise 2FA
  users must sign in with recovery codes.
- A restore drill now and then is the only proof a backup works: the archive, and the
  recordings with `--recordings`, until the restore reports no MISSING recording. CI decrypts one made by the
  real image with the real age tool and runs the restore check on it.

## Troubleshooting

| Symptom                                               | Look at                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "the site did not answer on https://…/api/health"     | DNS: does the A record point here (`dig +short example.org`)? Ports 80/443 open in a provider firewall? `docker compose logs caddy` (Caddy mode)        |
| certbot fails (nginx mode)                            | the same DNS and port checks; `/var/log/letsencrypt/letsencrypt.log`; Let's Encrypt's rate limits after many failed tries                               |
| "ports 80/443 are served by …"                        | another web server (Apache, Traefik, …) holds the ports; the installer supports only an empty server or nginx                                           |
| "another nginx server block already serves …"         | an existing nginx file claims the site's or calls name: remove that block or pick other names                                                           |
| "… would load before the other sites' servers"        | a file sorts after `zz-seasonal-*.conf`: mark the server that should answer requests by IP address `listen … default_server` in your own file           |
| "… answered requests without a known name …"          | the certificate shown without SNI changed after the reload; the files are back. Mark your own `default_server` for 443, then run again                  |
| "port 3800 is taken" (nginx mode)                     | something else listens on 127.0.0.1:3800                                                                                                                |
| calls connect but no audio/video                      | the UDP ports (50000–50499, 3478) and 7881/tcp in a provider firewall; LiveKit's log                                                                    |
| LiveKit logs "could not validate external IP"         | a warning at start: it checks its public IP by reaching itself (seen on the first deployment, 2026-11-01); it matters only if audio/video fail          |
| "no terminal: the first admin was not created"        | run `sudo ./deploy/install.sh --admin` on a terminal                                                                                                    |
| "the event bot does not answer on …/bot-admin/health" | the bot's env file needs `STANNOUNCEBOT_WEB_EMBEDDED=1` and `STANNOUNCEBOT_WEB_BASE_PATH=/bot-admin`, then a bot restart ("The event bot's admin page") |
| a run stopped half-way                                | fix the cause and run the installer again (it continues), or `--rollback` the printed snapshot                                                          |

Logs:

```sh
cd /opt/seasonal-entertainment/deploy/site
docker compose ps                                  # the site's health check: /api/health
docker compose logs -f --tail=100 site             # the app (start, jobs, errors)
docker compose logs -f --tail=100 caddy            # Caddy mode: requests, certificates
docker compose -f ../calls/docker-compose.yml logs -f --tail=100 livekit
journalctl -u seasonal-backup.service -u seasonal-calls-cert.service --since today
```

Docker keeps container logs in its default `json-file` driver. On a long-running server, cap them
in `/etc/docker/daemon.json` (`"log-opts": {"max-size": "10m", "max-file": "5"}`) and restart
Docker once.

## Testing the installer

`bash deploy/test/run.sh` runs the installer end to end on a PC with Docker. Each scenario
starts a systemd Ubuntu container as the server. Pebble (a local ACME server) stands in for
Let's Encrypt, and a small DNS points the test names at the server. Each scenario runs:

1. install from the working tree, with an answers file and a typed password (it must show only
   as `*` in the output);
2. checks: health over HTTPS against Pebble's root, the www redirect, call signalling over wss,
   the admin, file modes, the backup decrypting with the age key, ufw's rules (the server's own
   kept, exactly the missing ones added), and in nginx mode the answer for unknown names;
3. install again (the secrets must stay the same);
4. `--status`;
5. `--uninstall` (data and secrets must stay);
6. install once more (the data must still be there).

The scenarios:

- `caddy`: an empty 24.04 server, calls with recording, backups;
- `nginx`: a 24.04 server whose nginx already serves another site with its own certificate and
  no `default_server`; its file name sorts after the old `seasonal-*.conf`, as on the first
  deployment. That site must keep answering, unchanged, with its own certificate, also for
  requests by IP address and without SNI (`checks.sh unknown-name`, compared with the answer
  before the install). Before the second install the installer's files get their old names: the
  same check must then fail (the old behaviour), and the second install must move them and pass
  it again. ufw is active with `80,443/tcp`, `7881`, `50000:60000/udp` and `5349/tcp` for IPv4
  only: the installer may add only `3478/udp` and the IPv6 rule for `5349/tcp`. Before the second
  install, `80/tcp` and `443/tcp` are added and recorded in `ufw-added` beside `80,443/tcp`, as
  an earlier installer left the first server: the second install must remove exactly those two
  and say so. Every run is on a terminal without `--yes`: the first install must ask the
  CoinGecko key (answered empty), the later runs must not (`run-installer.exp` fails if they
  do). The Discord login's client id is answered empty the same way. The "KEEP SAFE" note must show on the first install only, each run takes one backup ("the
  first one" only the first time). With backups set up, the checkout tracks a bare "origin"
  repository inside the server; after the re-run origin gets a newer commit. `--update` must
  first refuse while a tracked file is modified (same commit, site not restarted), then take
  exactly one backup, keep the secrets and the remembered answers, move the checkout to the new
  commit on `master` and serve it (`/api/health`), with the same answer for unknown names. The
  event bot's admin page: asked on the first install and answered empty (remembered `none`, no
  locations, no include), not asked again; then a stub bot on 127.0.0.1:8090 (`stub-bot.py`,
  which records every request's headers) and a test env file with
  `STANNOUNCEBOT_WEB_ADMIN_TOKEN="<random>!@%;{}#'"` (double-quoted, with punctuation, CRLF line
  ends) are configured with an answers file, as the owner does. `checks-bot-admin.sh` logs in through the site's own API (the test admin with 2FA set up,
  a registered member) and checks: the admin gets the bot's page and the bot got its token and
  `X-Acting-User: admin`; a guest gets 401 (also with a forged token) and the member 403, none of
  which reach the bot; a forged `X-Bot-Admin-Token`, `X-Acting-User` and `X-Forwarded-For` from
  the browser never reach it; a cross-origin POST gets 403, a same-origin one passes with one
  audit entry; the token is in no nginx log, answer, `site.env`, state, snapshot, site container
  environment or log, nor in the installer's output; the answer for unknown names is unchanged.
  With the installer's `X-Acting-User` line taken out by hand, the header check must fail. After
  `--update` the page still works, `--uninstall` removes it, and the install after it brings it
  back.
- `jammy`: a 22.04 server, the site alone, ufw active with the app profile `Nginx Full`: the
  installer may add only `443/udp`. The admin password is typed first too short, then with a
  differing confirmation; the installer must explain and ask again each time.

The script takes the scenarios as arguments (`bash deploy/test/run.sh nginx`). It is not part of
`npm run verify` or CI: it takes long and needs privileged containers. Everything it creates
carries the label `seasonal.test` and is removed at the end (`KEEP=1` keeps it). Not testable
there: UDP media from outside (the PC's Docker network is not the internet).

Four quick ones run in CI (no root, no Docker): `bash deploy/test/bot-admin-token.test.sh` checks
how the event bot's token is read from its env file and which tokens nginx can carry ("The
event bot's admin page", "The token"); `bash deploy/test/discord.test.sh` checks how the Discord
settings are taken (from a secret file or the terminal, asked once, removed with `--discord`,
the secret never shown; "Discord login"); `bash deploy/test/update-copy.test.sh` checks the copy
`--update` makes without backups (where it lands, root only, the newest three kept, a failed
copy stopping the update, no copy with backups set up; "Updating"); `bash
deploy/test/backup-listing.test.sh` checks that the installer's newest backup (before an
install or update, and in `--status`) is an encrypted archive by name, never the `recordings/`
folder beside them (since 2026-11-11). `sudo bash
deploy/test/server-hardening.test.sh` checks the hardening of 2026-11-04 (the bot page's
headers, the logs without secret queries, LiveKit on 127.0.0.1, the refusal of a checkout
others could change, the backup folder 750; as root also the folder's rules for real).

## Reference: the manual steps

What the installer does, by hand, for a server where it cannot run or for understanding it.
Placeholders: `<SITE_DOMAIN>`, `<CALLS_DOMAIN>`, `<ACME_EMAIL>`.

### The server

```sh
apt update && apt full-upgrade -y
apt install -y unattended-upgrades ufw git
dpkg-reconfigure -plow unattended-upgrades   # security updates install themselves
```

Optional SSH hardening: create a user with your key and sudo, test the login in a **second
terminal**, then add `/etc/ssh/sshd_config.d/10-hardening.conf` with `PasswordAuthentication no`,
`KbdInteractiveAuthentication no` and `PermitRootLogin no`, and `systemctl reload ssh`.

Firewall (on a server that had none yet):

```sh
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp       # HTTP, HTTPS, HTTP/3
ufw allow 7881/tcp && ufw allow 50000:50499/udp                  # call media
ufw allow 3478/udp && ufw allow 5349/tcp                         # TURN
ufw enable
```

Docker writes its own iptables rules, and **a published container port bypasses ufw**. Only
Caddy publishes ports (80, 443), and in nginx mode the site publishes on `127.0.0.1` only. Never
publish the site on all addresses.

Docker from Docker's repository (Docker's install guide for Ubuntu):

```sh
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Configuration

Two files in `deploy/site/`, neither committed:

```sh
cd /opt/seasonal-entertainment/deploy/site
cp .env.example .env              # compose: SITE_DOMAIN, CALLS_DOMAIN, ACME_EMAIL, COMMIT_SHA, ...
cp ../../.env.example site.env    # the app: every key the server reads
chmod 600 .env site.env
```

In **`site.env`**:

| Key                     | Value                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`        | `openssl rand -hex 32` (production refuses less than 32 characters)                                                                          |
| `BOOTSTRAP_TOKEN`       | `openssl rand -hex 32`, only until the first admin exists                                                                                    |
| `SECRET_ENCRYPTION_KEY` | `openssl rand -base64 32`: encrypts 2FA secrets; **keep a copy off the server**, apart from the backups (losing it locks 2FA: docs/AUTH.md)  |
| `CALLS_URL`             | `wss://<CALLS_DOMAIN>`                                                                                                                       |
| `CALLS_API_KEY`         | a key name, e.g. `seasonal`                                                                                                                  |
| `CALLS_API_SECRET`      | `openssl rand -hex 32` (the same pair goes into `deploy/calls/.env` as `LIVEKIT_KEYS="<key>: <secret>"`)                                     |
| `COINGECKO_API_KEY`     | a free CoinGecko Demo key: ETH, POL and BTC prices on `/info/prices`; empty: "not connected" (docs/BOTS.md)                                  |
| `BACKUP_RECIPIENT`      | the `age1…` public key ("Backups")                                                                                                           |
| everything else         | empty: the defaults fit (docs/ARCHITECTURE.md, "Runtime configuration"); chat limits and link previews are admin settings (docs/SETTINGS.md) |

Set by `docker-compose.yml`, never in `site.env` (it would be overruled): `NODE_ENV=production`,
`HOST`, `PORT`, `TRUST_PROXY=1` (exactly one proxy in front), `PUBLIC_ORIGIN=https://<SITE_DOMAIN>`,
`DATABASE_PATH`, `MEDIA_DIR`, `BACKUP_DIR`.

Production **refuses to start** with development defaults (`server/src/productionConfig.js`,
`server/src/secretKey.js`, `server/src/calls/config.js`):

- a missing or short `SESSION_SECRET`;
- a missing `SECRET_ENCRYPTION_KEY`, or the development one;
- an `http://` origin;
- `COOKIE_SECURE=false` or `CSRF_STRICT=false`;
- a short `BOOTSTRAP_TOKEN`;
- LiveKit's `devkey`/`secret` pair, or a `CALLS_API_SECRET` under 32 characters;
- `ws://` for calls.

**The bots' files** (docs/BOTS.md) are mounted read-only. Put the mounts in
`deploy/site/docker-compose.override.yml` (never committed), for example:

```yaml
services:
  site:
    volumes:
      - /path/to/price-bot/snapshots.db:/bots/snapshots.db:ro
      - /path/to/price-bot/mining_rates.json:/bots/mining_rates.json:ro
      - /path/to/event-bot/events.db:/bots/events.db:ro
```

Then set `PRICE_BOT_DB=/bots/snapshots.db`, `PRICE_BOT_MINING_RATES=/bots/mining_rates.json` and
`EVENT_BOT_DB=/bots/events.db` in `site.env`. Points to know:

- The files must exist before `docker compose up`: Docker turns a missing bind source into an
  empty directory.
- They must be readable for uid 1000.
- A mount follows the file: if a bot replaces its file, restart the site.

### Start (Caddy mode)

```sh
cd /opt/seasonal-entertainment/deploy/site
install -d -o 1000 -g 1000 /var/backups/seasonal   # the image's "node" user is uid 1000
sed -i "s/^COMMIT_SHA=.*/COMMIT_SHA=$(git rev-parse HEAD)/" .env
docker compose up -d --build
curl -s https://<SITE_DOMAIN>/api/health    # {"ok":true,...,"commit":"…"}
```

The first start adds the info pages, events, games entry, chat rooms and stickers.

### nginx mode by hand

1. In `deploy/site/`, give the site `ports: ['127.0.0.1:3800:3800']` and Caddy
   `profiles: [caddy]` in a `docker-compose.override.yml`.
2. Add a port-80 server block for `<SITE_DOMAIN>` that serves `/.well-known/acme-challenge/` from
   a webroot (e.g. `/var/www/seasonal-acme`). Then `nginx -t` and `systemctl reload nginx`.
3. Get the certificate:
   `certbot certonly --webroot -w /var/www/seasonal-acme --cert-name seasonal-site -d <SITE_DOMAIN>`.
4. Add the 443 block. It proxies to `http://127.0.0.1:3800` with `X-Forwarded-For $remote_addr`
   and `X-Forwarded-Proto https`, a WebSocket upgrade for `/ws/chat`, and
   `client_max_body_size 30m`. Then `nginx -t` and a reload.
5. For calls, do the same for `<CALLS_DOMAIN>` towards `http://127.0.0.1:7880` (WebSocket
   upgrade for everything).
6. Copy its `fullchain.pem` and `privkey.pem` to `/etc/seasonal/calls-cert/` from a certbot deploy
   hook, so renewals reach LiveKit.

`deploy/install/lib/nginx.sh` writes exactly these files; read it for the full text.

### The call service

On the same server, after the site's proxy has the calls certificate:

```sh
cd /opt/seasonal-entertainment/deploy/calls
cp .env.example .env && chmod 600 .env
#   LIVEKIT_KEYS="<CALLS_API_KEY>: <CALLS_API_SECRET>"   (as in site.env)
#   CALLS_DOMAIN=<CALLS_DOMAIN>
#   CALLS_CERT_DIR=/etc/seasonal/calls-cert
../site/calls-cert.sh seasonal-site-caddy-1 <CALLS_DOMAIN> /etc/seasonal/calls-cert "$PWD" || true
docker compose up -d
```

In Caddy mode, install the daily hand-over: copy `../site/systemd/seasonal-calls-cert.*` to
`/etc/systemd/system/`, replace `CALLS_DOMAIN_HERE`, and enable the timer. On its **own server**
instead: copy `deploy/calls/` there, set `ACME_EMAIL`, start it with
`docker compose --profile proxy up -d` (its own Caddy), and remove `calls.caddy` from the site's
server (docs/CALLS.md, "Moving the call service").

### Call load test

To see what the call service carries on this server, run `sudo ./deploy/calls/loadtest.sh` in
the checkout (about 10 minutes; docs/CALLS.md, "Load test"). It stops by itself when the server
gets too busy, and leaves nothing behind.

### Call recording

The installer sets this up with `RECORDING=yes`. By hand (docs/CALLS.md, "Recording"):
`deploy/calls/docker-compose.recording.yml` adds LiveKit's egress (records in its own Chrome;
limited to 3 CPUs and 3 GB, and a recording is counted at 2.0 CPUs, its `cpu_cost`) and Redis
(127.0.0.1 only). Egress takes a recording only when that cost fits its free CPUs; with its
default cost (4) and the earlier 2-CPU limit it declined every one, and the start timed out
(fixed 2026-11-06). Memory: a recording on the VPS peaked at 1.79 GB (2026-11-06), too close to
the earlier 2 GB. Chrome's font cache is the volume `egress-cache`, filled once by the one-shot
service of the same name before egress starts, so the first recording after an update does not
wait for Chrome to build it (docs/CALLS.md, "Recording"; fixed 2026-11-09). In `deploy/calls/.env` set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` (the same
pair) and `RECORDINGS_DIR=<site-data mountpoint>/media/recordings`
(`docker volume inspect seasonal-site_site-data --format '{{ .Mountpoint }}'`). That folder must
be owner uid 1000 (the site, which reads and deletes recordings), group 0 with write (the egress
image's user, uid 1001, group 0, writes them) and setgid: `chown 1000:0` and `chmod 2775` on the
folder itself (the installer does this on every run, `prepare_recordings_dir` in
`deploy/install/lib/services.sh`; before 2026-11-06 it was 755 1000:1000, and every recording
failed at its end with "permission denied"). In `site.env` set
`CALLS_RECORDINGS_DIR=/data/media/recordings` and `CALLS_EGRESS_OUTPUT_DIR=/recordings`. Start
with both compose files. Size: at most about **480 MB per recorded hour** (a moving test camera
measured about 270 MB); plan the disk and the backups by the hours recorded.

### The first admin

With `BOOTSTRAP_TOKEN` set in `site.env` and the site restarted:

```sh
cd /opt/seasonal-entertainment/deploy/site
read -rs PW && printf '%s\n' "$PW" | docker compose exec -T site \
  node scripts/bootstrap-admin.mjs <admin name> <admin email>; unset PW
```

The script derives the salt and auth key inside the container, as a browser does. The password
itself goes nowhere. Then log in, set up 2FA, remove `BOOTSTRAP_TOKEN` and run
`docker compose up -d`.

### Backups by hand

```sh
cp /opt/seasonal-entertainment/deploy/site/systemd/seasonal-backup.* /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now seasonal-backup.timer
systemctl start seasonal-backup.service && ls /var/backups/seasonal
```

## Files

| File                                                                       | What                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/install.sh`                                                        | the one-command installer (entry: options, the install flow)                                                                                                                                                                     |
| `deploy/install/lib/`                                                      | its parts: prompts, long steps and state, detection, packages, configuration, nginx and its answer for unknown names, the event bot's admin page, firewall, services, snapshot/status/uninstall, `--update`                      |
| `deploy/install/answers.example`                                           | the answers file for unattended runs                                                                                                                                                                                             |
| `deploy/install/certbot-hook.sh`, `deploy/install/caddy/www.caddy`         | nginx mode: hands renewed certificates on; Caddy mode: the www redirect                                                                                                                                                          |
| `deploy/test/`                                                             | the installer's end-to-end tests (`run.sh`, `checks.sh`, `checks-bot-admin.sh`, `stub-bot.py`; systemd Ubuntu containers, Pebble, test DNS)                                                                                      |
| `deploy/site/Dockerfile`                                                   | the image: multi-stage, production build, non-root `node` user, base image pinned by digest                                                                                                                                      |
| `deploy/site/docker-compose.yml`                                           | site + Caddy; volumes for the database and media, backups on the host                                                                                                                                                            |
| `deploy/site/Caddyfile`, `caddy/calls.caddy`                               | HTTPS for both domains; wss to LiveKit                                                                                                                                                                                           |
| `deploy/site/.env.example`                                                 | compose settings (domains, ACME email and CA, commit, sites folder)                                                                                                                                                              |
| `deploy/site/calls-cert.sh`                                                | Caddy mode: Caddy's calls certificate → LiveKit's TURN                                                                                                                                                                           |
| `deploy/site/systemd/`                                                     | the backup and certificate timers                                                                                                                                                                                                |
| `deploy/calls/`                                                            | the call service (docs/CALLS.md); `Caddyfile` for its own server                                                                                                                                                                 |
| `deploy/calls/docker-compose.recording.yml`                                | optional: call recording (egress and Redis)                                                                                                                                                                                      |
| `scripts/backup.mjs`, `scripts/restore.mjs`, `scripts/bootstrap-admin.mjs` | operations, inside the site container                                                                                                                                                                                            |
| `deploy/pc/`                                                               | the PC side of the backups: Windows `Get-SeasonalBackups.ps1` (the daily task), `SeasonalBackups.psm1`, `SeasonalBackups.Tests.ps1`; Linux and macOS `get-seasonal-backups.sh` (cron or launchd), `get-seasonal-backups.test.sh` |
| `.dockerignore`                                                            | keeps data, secrets and build output out of the image                                                                                                                                                                            |

CI (`.github/workflows/ci.yml`, job "deployment files") builds the image (no push) and starts it
in production mode against `/api/health`. It validates both compose projects and all Caddyfiles
(also with the installer's sites folder), runs the PC side's tests (PowerShell for Windows, POSIX
sh for Linux and macOS) and the installer's token and Discord tests
(`deploy/test/bot-admin-token.test.sh`, `deploy/test/discord.test.sh`),
and runs shellcheck over the installer, its tests and the PC side's
shell script, on every pull request.
