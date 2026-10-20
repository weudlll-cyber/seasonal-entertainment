# Deployment runbook

How the site goes onto its server: a fresh **Ubuntu 24.04 LTS** VPS at Contabo, **Docker Engine
with the Compose plugin**, **Caddy** in front for automatic HTTPS (decision rule of 2026-10-18;
the owner may change it). Written in SE-NIGHT-2 part 7. **Nothing has been deployed yet.**

Everything marked **⚠ OWNER** needs a value or a decision from the owner before go-live.

## What runs where

| On the site's VPS                          | What                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `deploy/site/` (project `seasonal-site`)   | the site container (Node, one process: pages, API, chat WebSocket) and Caddy (ports 80/443, certificates for both domains)   |
| `deploy/calls/` (project `seasonal-calls`) | LiveKit, the call service (host networking; its own compose project, so it can move to another VPS unchanged: docs/CALLS.md) |
| systemd timers                             | the nightly backup; the daily hand-over of the calls certificate to LiveKit's TURN                                           |
| The owner's Windows PC                     | a daily task fetches the encrypted backups over read-only sftp and keeps them (`deploy/pc/`; section 6)                      |

The site's data lives in the Docker volume `seasonal-site_site-data` (`/data` in the container:
`seasonal.db` and `media/`). Backups go to `/var/backups/seasonal` on the host.

**⚠ OWNER, before starting**:

- The two domains: `SITE_DOMAIN` (e.g. `example.org`) and `CALLS_DOMAIN` (e.g.
  `calls.example.org`). Both need DNS **A** (and **AAAA**, if the VPS has IPv6) records pointing
  at the VPS before the first start: Caddy gets the certificates on the first request.
- The email address Let's Encrypt writes to (`ACME_EMAIL`).
- Your SSH public key.
- An age key pair for the backups, made on the owner's PC (section 6, "Backups to your PC"):
  backups are kept there (owner decision 2026-10-19).
- Whether the call service starts on this VPS (the default here) or its own.
- Whether the price and event bots run on this VPS too: the site reads their files through
  read-only mounts (section 3, "The owner's bots").
- Still open and not needed for the deployment itself: login lockout values, chat retention
  period, roles, info page texts, Telegram/Discord, legal pages.

## 1. The fresh VPS

As `root` on the new server (Contabo's first login):

```sh
apt update && apt full-upgrade -y
apt install -y unattended-upgrades ufw git
dpkg-reconfigure -plow unattended-upgrades   # security updates install themselves

# A user for the work, with your SSH key; root logs in no more after step 1.
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys       # ⚠ OWNER: paste your public key
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
passwd deploy                                # a password for sudo only
```

In a **second terminal**, check that `ssh deploy@<server>` works and `sudo -v` asks for the
password. Only then switch off password and root logins:

```sh
cat > /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
systemctl reload ssh
```

### Firewall (ufw)

```sh
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp                  # Caddy: HTTP (redirects; certificate challenges)
ufw allow 443/tcp                 # Caddy: HTTPS (site and wss for both domains)
ufw allow 443/udp                 # Caddy: HTTP/3
# The call service (docs/CALLS.md, "Ports and firewall"); 7880 stays closed.
ufw allow 7881/tcp                # media over TCP
ufw allow 50000:50499/udp         # media (250 participants)
ufw allow 3478/udp                # TURN over UDP
ufw allow 5349/tcp                # TURN over TLS
ufw enable
ufw status verbose
```

Docker writes its own iptables rules, and **a published container port bypasses ufw**. Only
Caddy publishes ports (80, 443), and those are meant to be public. The site container publishes
nothing, and LiveKit uses host networking, which ufw does govern. Never add a `ports:` entry to
the site service.

### Docker Engine and the Compose plugin

From Docker's own apt repository (Docker's install guide for Ubuntu):

```sh
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker deploy         # log in again afterwards; the docker group is root-equivalent
docker run --rm hello-world
```

## 2. The code

As `deploy`:

```sh
sudo install -d -o deploy -g deploy /opt/seasonal-entertainment
git clone https://github.com/weudlll-cyber/seasonal-entertainment.git /opt/seasonal-entertainment
cd /opt/seasonal-entertainment
git checkout <the release commit>   # ⚠ OWNER: which commit goes live
```

The repository is private (⚠ OWNER: a read-only deploy key for the VPS, or an access token).

## 3. Configuration

Two files in `deploy/site/`, both never committed:

```sh
cd /opt/seasonal-entertainment/deploy/site
cp .env.example .env              # compose: SITE_DOMAIN, CALLS_DOMAIN, ACME_EMAIL, ...
cp ../../.env.example site.env    # the app: every key the server reads
chmod 600 .env site.env
openssl rand -hex 32              # run once per secret below
```

In **`site.env`**:

| Key                     | Value                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`        | `openssl rand -hex 32` (production refuses less than 32 characters)                                                                          |
| `BOOTSTRAP_TOKEN`       | `openssl rand -hex 32`, only until the first admin exists (step 5)                                                                           |
| `SECRET_ENCRYPTION_KEY` | `openssl rand -base64 32`: encrypts 2FA secrets; **keep a copy outside the VPS**, apart from the backups (losing it locks 2FA: docs/AUTH.md) |
| `CALLS_URL`             | `wss://<CALLS_DOMAIN>`                                                                                                                       |
| `CALLS_API_KEY`         | a key name, e.g. `seasonal`                                                                                                                  |
| `CALLS_API_SECRET`      | `openssl rand -hex 32` (the same pair goes into `deploy/calls/.env`)                                                                         |
| `COINGECKO_API_KEY`     | your free CoinGecko Demo key (coingecko.com/en/api): ETH, POL and BTC prices on `/info/prices`; empty: "not connected" (docs/BOTS.md)        |
| everything else         | empty: the defaults fit (docs/ARCHITECTURE.md, "Runtime configuration")                                                                      |

### The owner's bots (prices and events, read-only)

The site reads the price bot's and the event bot's SQLite files (docs/BOTS.md). **This assumes
the bots run on the same VPS as the site** (open owner decision). Mount both files into the site
container **read-only**, in `deploy/site/docker-compose.override.yml` (never committed; compose
reads it beside `docker-compose.yml`):

```yaml
services:
  site:
    volumes:
      - /var/lib/stpricebot/snapshots.db:/bots/snapshots.db:ro
      - /var/lib/stpricebot/mining_rates.json:/bots/mining_rates.json:ro
      - /var/lib/stannouncebot/stannouncebot.db:/bots/stannouncebot.db:ro
```

and in **`site.env`**: `PRICE_BOT_DB=/bots/snapshots.db`,
`PRICE_BOT_MINING_RATES=/bots/mining_rates.json`, `EVENT_BOT_DB=/bots/stannouncebot.db`.
Leave a key empty to keep that feature off (the pages then say the data source is not connected).

- Both files must exist on the host **before** `docker compose up`: Docker creates a missing bind
  source as an empty directory, and the site then answers 503 for that bot until it is fixed.
- The site's user in the container must be able to read them (the bots' files are usually
  readable by everyone; check with `ls -l`).
- A file mount follows the file, not its name: if a bot ever replaces its file (a restore, a
  rename), restart the site (`docker compose restart site`) so it sees the new one.
- Neither bot uses SQLite's WAL mode; while a bot is in the middle of writing, a read can fail
  once and the next one (or the five-minute cache) carries on.

Set by `docker-compose.yml`, never in `site.env` (it would be overruled): `NODE_ENV=production`,
`HOST`, `PORT`, `TRUST_PROXY=1` (exactly one proxy in front: Caddy),
`PUBLIC_ORIGIN=https://<SITE_DOMAIN>`, `DATABASE_PATH`, `MEDIA_DIR`, `BACKUP_DIR`.

Production **refuses to start** with development defaults (`server/src/productionConfig.js`,
`server/src/secretKey.js`, `server/src/calls/config.js`). That covers a missing or short
`SESSION_SECRET`, a missing `SECRET_ENCRYPTION_KEY` or the development one, an `http://` origin,
`COOKIE_SECURE=false`, a short `BOOTSTRAP_TOKEN`, LiveKit's `devkey`/`secret` pair, a
`CALLS_API_SECRET` under 32 characters, and `ws://` for calls. Cookies are `Secure` with the
`__Host-` prefix. The site sees each visitor's own address (Caddy's `X-Forwarded-For`, one
trusted proxy), so the per-IP limits work.

## 4. First start

```sh
cd /opt/seasonal-entertainment/deploy/site
sudo install -d -o 1000 -g 1000 /var/backups/seasonal   # the image's "node" user is uid 1000
export COMMIT_SHA=$(git rev-parse HEAD)
sed -i "s/^COMMIT_SHA=.*/COMMIT_SHA=$COMMIT_SHA/" .env
docker compose up -d --build
docker compose ps                  # site "healthy", caddy "running"
docker compose logs caddy | grep -i certificate
curl -s https://<SITE_DOMAIN>/api/health    # {"ok":true,...,"commit":"<first 12 of COMMIT_SHA>"}
```

The first start adds the info pages, events, games entry, chat rooms and stickers (as in
development).

### The call service on the same VPS

After the site's Caddy has the calls domain's certificate (the first request to
`https://<CALLS_DOMAIN>` makes it get one; a 502 there is fine while LiveKit is not running yet):

```sh
cd /opt/seasonal-entertainment/deploy/calls
cp .env.example .env && chmod 600 .env
#   LIVEKIT_KEYS="<CALLS_API_KEY>: <CALLS_API_SECRET>"   (as in site.env)
#   CALLS_DOMAIN=<CALLS_DOMAIN>
#   CALLS_CERT_DIR=/etc/seasonal/calls-cert
sudo ../site/calls-cert.sh seasonal-site-caddy-1 <CALLS_DOMAIN> /etc/seasonal/calls-cert "$PWD" || true
docker compose up -d
sudo ../site/calls-cert.sh seasonal-site-caddy-1 <CALLS_DOMAIN> /etc/seasonal/calls-cert "$PWD"
```

The first `calls-cert.sh` puts the certificate in place before LiveKit starts; its restart step
fails while nothing runs yet (hence `|| true`). Then install the daily hand-over (Caddy renews
on its own; LiveKit's TURN needs the new files):

```sh
sudo cp ../site/systemd/seasonal-calls-cert.* /etc/systemd/system/
sudo sed -i "s/CALLS_DOMAIN_HERE/<CALLS_DOMAIN>/" /etc/systemd/system/seasonal-calls-cert.service
sudo systemctl daemon-reload && sudo systemctl enable --now seasonal-calls-cert.timer
```

**⚠ Check on the first real start**: that LiveKit reads `/certs/privkey.pem` (it is installed
with mode 0600, owner root). If LiveKit runs as another user in its image, make the folder
readable to that user only. This was not testable tonight: no real server.

On its **own VPS** instead: copy `deploy/calls/` there, set `ACME_EMAIL` in its `.env`, start it
with `docker compose --profile proxy up -d` (its own Caddy), and delete
`deploy/site/caddy/calls.caddy` on the site's VPS. Moving later: docs/CALLS.md, "Moving the call
service".

## 5. The first admin

With `BOOTSTRAP_TOKEN` set in `site.env` (restart the site after setting it:
`docker compose up -d`):

```sh
cd /opt/seasonal-entertainment/deploy/site
read -rs PW && printf '%s\n' "$PW" | docker compose exec -T site \
  node scripts/bootstrap-admin.mjs <admin name> <admin email>; unset PW
```

`scripts/bootstrap-admin.mjs` derives the salt and auth key from the password inside the
container, as a browser does, and calls `POST /api/auth/bootstrap` with the token in the
`x-bootstrap-token` header. The password itself goes nowhere. Then:

1. Log in at `https://<SITE_DOMAIN>/login`; admins must set up 2FA before anything else (the
   site asks).
2. Remove `BOOTSTRAP_TOKEN` from `site.env` and run `docker compose up -d`. The route stays closed
   anyway once an admin exists.

## 6. Backups

Every night `seasonal-backup.timer` runs `scripts/backup.mjs` inside the site container
(`server/src/backup/`):

- The database is copied through **SQLite's online backup API** (consistent while the site
  runs; never a file copy) and checked with `PRAGMA integrity_check`.
- The media folder is copied too, with a `manifest.json` (database SHA-256, media file count).
- **Encrypted** (decision rule of 2026-10-19, on by default; the owner may confirm or change
  it): the backup is packed as a `.tar` and encrypted with **age** to the owner's **public**
  key. It uses `age-encryption` 0.3.1, the age author's own implementation, pinned. Only
  `/var/backups/seasonal/<UTC time>.tar.age` stays on the server. The private key exists only on
  the owner's PC, so the server cannot read its own backups, and neither can anyone who takes
  them from it. `BACKUP_ENCRYPTION=off` in `site.env` would keep plain backup folders instead;
  not recommended.
- A backup counts only when complete: it is written as `….partial` and renamed at the end.
- Backups older than **14 days** are deleted, but only after a new one is complete.
- The owner's PC fetches every new backup over sftp (next section) and keeps its own copies:
  the off-site copy (owner decision 2026-10-19: backups are kept locally at the owner's PC).

In `site.env`: `BACKUP_RECIPIENT=age1…`, the public key from the next section. Without it the
backup refuses to run and says so (and it refuses a private key pasted there by mistake). Then:

```sh
sudo cp /opt/seasonal-entertainment/deploy/site/systemd/seasonal-backup.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now seasonal-backup.timer
sudo systemctl start seasonal-backup.service      # one now, to see it work
journalctl -u seasonal-backup.service -n 20       # "… .tar.age (encrypted): database …"
ls /var/backups/seasonal
```

The backups hold the whole database (accounts, chat; direct messages only as ciphertext; 2FA
secrets encrypted with `SECRET_ENCRYPTION_KEY`, which is **not** in the backups). A restore onto
a new VPS needs the same `SECRET_ENCRYPTION_KEY` in its `site.env`, or 2FA users must sign in
with recovery codes.

### Backups to your PC

On the owner's Windows PC, once. All commands are PowerShell.

**1. The age key pair.** Install the age tool, version **1.2.1** (the version the encryption is
checked against): `winget install --id FiloSottile.age --version 1.2.1`, or download
`age-v1.2.1-windows-amd64.zip` from the official releases page,
`https://github.com/FiloSottile/age/releases`, and put `age.exe` and `age-keygen.exe` on your
PATH. Then:

```powershell
New-Item -ItemType Directory -Force "$HOME\SeasonalBackupKey" | Out-Null
age-keygen -o "$HOME\SeasonalBackupKey\backup-key.txt"   # prints "Public key: age1…"
```

- The **public key** (`age1…`) goes into the server's `site.env` as `BACKUP_RECIPIENT`.
- The **private key file** `backup-key.txt` is the only way to read the backups. Keep it on
  this PC, **not** in the backup folder and **never** on the VPS. Also keep a second copy
  offline (a USB stick in a drawer, or a password manager's secure note). Without it, every
  backup is unreadable.

**2. A read-only backup user on the VPS** (as `deploy`, with sudo). It may only read the backup
folder over sftp: no shell, no writing, nothing else on the server.

```sh
sudo useradd --system --create-home --shell /usr/sbin/nologin seasonal-backup
sudo install -d -o root -g root -m 755 /srv/backup-chroot /srv/backup-chroot/backups
echo '/var/backups/seasonal /srv/backup-chroot/backups none bind,ro 0 0' | sudo tee -a /etc/fstab
sudo systemctl daemon-reload && sudo mount /srv/backup-chroot/backups
sudo tee /etc/ssh/sshd_config.d/20-seasonal-backup.conf > /dev/null <<'CONF'
Match User seasonal-backup
    ChrootDirectory /srv/backup-chroot
    ForceCommand internal-sftp -R
    AllowTcpForwarding no
    X11Forwarding no
    PasswordAuthentication no
CONF
sudo sshd -t && sudo systemctl reload ssh
```

`internal-sftp -R` is read-only; the chroot shows only `/backups`, a read-only view of
`/var/backups/seasonal`.

**3. Its SSH key**, made on the PC, without a passphrase (the task runs unattended; the account
can only read encrypted files):

```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\seasonal-backup" -N '""' -C seasonal-backup
Get-Content "$HOME\.ssh\seasonal-backup.pub"
```

On the VPS, put that one line into the backup user's `authorized_keys`:

```sh
sudo install -d -o seasonal-backup -g seasonal-backup -m 700 /home/seasonal-backup/.ssh
sudo nano /home/seasonal-backup/.ssh/authorized_keys          # paste the .pub line
sudo chown seasonal-backup: /home/seasonal-backup/.ssh/authorized_keys
sudo chmod 600 /home/seasonal-backup/.ssh/authorized_keys
```

**4. The first run by hand.** Copy `deploy\pc\` (three files) to e.g.
`$HOME\SeasonalBackupTools`. Connect once interactively, so Windows knows the server's host key
(answer `yes`), then fetch:

```powershell
sftp -i "$HOME\.ssh\seasonal-backup" seasonal-backup@<SITE_DOMAIN>     # "yes", then: ls /backups, bye
& "$HOME\SeasonalBackupTools\Get-SeasonalBackups.ps1" -Server <SITE_DOMAIN> -KeyFile "$HOME\.ssh\seasonal-backup"
```

It fetches every backup the server has that the PC has not (catching up after the PC was off;
the server keeps 14), into `$HOME\SeasonalBackups`. It keeps the newest 30 there (`-Keep`), and
logs each run to `$HOME\SeasonalBackups\download.log`. A download arrives as `….partial` and gets
its name only when complete.

**5. The daily task.** Windows Task Scheduler, daily at 09:00 (the server's backup is at 03:30
server time). "Run as soon as possible after a missed start" also covers a PC that was off then:

```powershell
$script = "$HOME\SeasonalBackupTools\Get-SeasonalBackups.ps1"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
  "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Server <SITE_DOMAIN> " +
  "-KeyFile `"$HOME\.ssh\seasonal-backup`"")
$trigger = New-ScheduledTaskTrigger -Daily -At 09:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName 'Seasonal backups' -Action $action -Trigger $trigger -Settings $settings
```

**Checking that it ran:**

```powershell
Get-ScheduledTaskInfo -TaskName 'Seasonal backups'   # LastRunTime, LastTaskResult (0 = fine)
Get-Content "$HOME\SeasonalBackups\download.log" -Tail 10
Get-ChildItem "$HOME\SeasonalBackups" -Filter *.tar.age | Sort-Object Name | Select-Object -Last 3
```

`LastTaskResult` 1 means a run failed; the log says which backup and why, and the next run
fetches it again.

### Restoring

From a backup on the PC (the server's own copies are encrypted, and only the PC can open them):

```powershell
age -d -i "$HOME\SeasonalBackupKey\backup-key.txt" -o "$HOME\restore.tar" "$HOME\SeasonalBackups\<time>.tar.age"
scp "$HOME\restore.tar" deploy@<SITE_DOMAIN>:/tmp/restore.tar
```

On the VPS (as `deploy`):

```sh
sudo mv /tmp/restore.tar /var/backups/seasonal/restore.tar     # the container sees /backups
cd /opt/seasonal-entertainment/deploy/site
docker compose run --rm --no-deps site node scripts/restore.mjs /backups/restore.tar --check
docker compose stop site
docker compose run --rm --no-deps site node scripts/restore.mjs /backups/restore.tar --force
docker compose start site
curl -s https://<SITE_DOMAIN>/api/health
sudo rm /var/backups/seasonal/restore.tar                      # the plain copy goes again
```

Then delete `$HOME\restore.tar` on the PC too: decrypted, it is the whole database in plain
form.

`--check` verifies the checksum, the SQLite integrity and the media count without touching
anything. The restore refuses existing data without `--force`. With it, the current database
(with its `-wal`/`-shm` files) and media folder are **moved aside** to `….before-restore-<time>`
in the volume, never deleted. Delete those by hand once the restored site looks right. A restore
drill now and then (into a scratch VPS or a copy of the volume) is the only proof a backup works.
In CI, `server/test/backupEncrypted.test.js` decrypts an encrypted backup and restores it into a
temporary location. The "deployment files" job decrypts one made by the real image with the real
age tool and runs the restore check on it.

## 7. Updating

```sh
cd /opt/seasonal-entertainment
sudo systemctl start seasonal-backup.service       # a fresh backup first
git fetch && git checkout <new commit>
cd deploy/site
export COMMIT_SHA=$(git rev-parse HEAD)
sed -i "s/^COMMIT_SHA=.*/COMMIT_SHA=$COMMIT_SHA/" .env
docker compose up -d --build                       # builds, then replaces the container
curl -s https://<SITE_DOMAIN>/api/health           # shows the new commit
```

The site is down for the few seconds the container takes to start. Live chat connections
reconnect by themselves, and live calls continue (LiveKit is not restarted). Database changes are
additive (new tables and columns, added on start), so they need no separate step.

## 8. Rollback

```sh
cd /opt/seasonal-entertainment
git checkout <previous commit>
cd deploy/site && export COMMIT_SHA=$(git rev-parse HEAD)
sed -i "s/^COMMIT_SHA=.*/COMMIT_SHA=$COMMIT_SHA/" .env
docker compose up -d --build
```

The previous image is rebuilt from that commit; its layers are usually still cached. Because
database changes are additive, older code runs on a newer database. If an update ever changed
data in a way the old code cannot read, restore the backup taken before the update (section 6,
"Restoring"); anything written since is then lost.

## 9. Logs and health

```sh
cd /opt/seasonal-entertainment/deploy/site
docker compose ps                                  # the site's health check: /api/health
docker compose logs -f --tail=100 site             # the app (start, jobs, errors)
docker compose logs -f --tail=100 caddy            # requests, certificates
docker compose -f ../calls/docker-compose.yml logs -f --tail=100 livekit
journalctl -u seasonal-backup.service -u seasonal-calls-cert.service --since today
```

Docker keeps container logs in its default `json-file` driver. For long-running servers, cap
them in `/etc/docker/daemon.json` (`"log-opts": {"max-size": "10m", "max-file": "5"}`) and
restart Docker once.

## Files

| File                                                                       | What                                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `deploy/site/Dockerfile`                                                   | the image: multi-stage, production build, non-root `node` user, base image pinned by digest                                 |
| `deploy/site/docker-compose.yml`                                           | site + Caddy; volumes for the database and media, backups on the host                                                       |
| `deploy/site/Caddyfile`, `caddy/calls.caddy`                               | HTTPS for both domains; wss to LiveKit                                                                                      |
| `deploy/site/.env.example`                                                 | compose settings (domains, ACME email, commit)                                                                              |
| `deploy/site/calls-cert.sh`                                                | Caddy's calls certificate → LiveKit's TURN                                                                                  |
| `deploy/site/systemd/`                                                     | the backup and certificate timers                                                                                           |
| `deploy/calls/`                                                            | the call service (docs/CALLS.md); `Caddyfile` for its own VPS                                                               |
| `scripts/backup.mjs`, `scripts/restore.mjs`, `scripts/bootstrap-admin.mjs` | operations, inside the site container                                                                                       |
| `deploy/pc/`                                                               | the PC side of the backups: `Get-SeasonalBackups.ps1` (the daily task), `SeasonalBackups.psm1`, `SeasonalBackups.Tests.ps1` |
| `.dockerignore`                                                            | keeps data, secrets and build output out of the image                                                                       |

CI (`.github/workflows/ci.yml`, job "deployment files") builds the image (no push), starts it in
production mode against `/api/health`, and validates both compose projects and all Caddyfiles
on every pull request.
