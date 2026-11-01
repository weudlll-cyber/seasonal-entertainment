#!/bin/bash
# ============================================================
# File:        run.sh
# Path:        deploy/test/run.sh
# Project:     Seasonal Entertainment
# Description: The installer's end-to-end tests (docs/DEPLOYMENT.md, "Testing the installer"),
#              on any PC with Docker: `bash deploy/test/run.sh [caddy] [nginx] [jammy]` (all
#              three by default). Each scenario starts a systemd Ubuntu container as the server
#              (server.Dockerfile), with Pebble standing in for Let's Encrypt and a small DNS
#              (Corefile) that points the test names at it, then: install from the working tree
#              with an answers file and a typed password (run-installer.exp), check
#              (checks.sh), install again (nothing may change), --status, --uninstall, install
#              once more (the data must still be there). Scenarios: "caddy" = an empty 24.04
#              server, calls with recording, www redirect, backups; "nginx" = a 24.04 server
#              whose nginx already serves another site with its own certificate and no
#              default_server (requests by IP address must keep its answer; before the re-run
#              the installer's files get their old names, which the re-run must move), and ufw
#              active with combined, range and IPv4-only rules, calls, a bot's file, backups,
#              and --update from a bare "origin" in the server that gets a newer commit (refused
#              first while a tracked file is modified), every run on a terminal without --yes:
#              the CoinGecko key asked once and answered empty, then never again; before the
#              re-run 80/tcp and 443/tcp are added and recorded as the installer's beside the
#              server's 80,443/tcp (as an earlier installer did), which the re-run must remove;
#              the KEEP SAFE note only on the first install, one backup per run; the event
#              bot's admin page asked once and answered empty (remembered "none", not asked
#              again), then configured with an answers file naming a stub bot's env file and
#              checked through the site's login (checks-bot-admin.sh; once with the installer's
#              X-Acting-User line taken out, which the header check must see), kept by
#              --update, removed by --uninstall and back after the install that follows; "jammy" =
#              a 22.04 server with ufw active and the app profile "Nginx Full", the site alone,
#              and a too-short password and a differing confirmation typed first.
#              Not part of npm run verify or CI (it takes long and needs Docker with privileged
#              containers). Everything it creates carries the label seasonal.test and is
#              removed at the end (KEEP=1 keeps it for a look).
# ============================================================

set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: container paths stay as written

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
LABEL=seasonal.test=seasonal-install-test
NET=seasonal-install-test
SERVER=seasonal-install-test-server
SERVER_IMAGE=seasonal-install-test-server
PEBBLE_IMAGE=ghcr.io/letsencrypt/pebble:2.7.0
DNS_IMAGE=coredns/coredns:1.11.3
REMOTE=/opt/seasonal-entertainment
RESULTS="${RESULTS:-$(mktemp)}"
# Only for this test's admin account inside the throwaway server.
TEST_ADMIN_PASSWORD="test-$(openssl rand -hex 8)"
export TEST_ADMIN_PASSWORD

say() { printf '[test] %s\n' "$*" | tee -a "$RESULTS"; }

# A path docker.exe can read, also from Git Bash on Windows.
host_path() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }

# -i: several steps feed the server through stdin (the working tree, the answers).
on_server() { docker exec -i "$SERVER" "$@"; }

# Images this run pulled are removed at the end; ones that were already there stay.
PULLED=()
pull_once() {
  docker image inspect "$1" >/dev/null 2>&1 || { docker pull -q "$1" >/dev/null && PULLED+=("$1"); }
}

cleanup() {
  [[ "${KEEP:-}" == 1 ]] && { say "KEEP=1: test containers left running (label $LABEL)"; return; }
  docker ps -aq --filter "label=$LABEL" | xargs -r docker rm -f >/dev/null
  docker volume ls -q --filter "label=$LABEL" | xargs -r docker volume rm >/dev/null
  docker network ls -q --filter "label=$LABEL" | xargs -r docker network rm >/dev/null
  docker image ls -q --filter "label=$LABEL" | sort -u | xargs -r docker rmi -f >/dev/null 2>&1 || true
  ((${#PULLED[@]} == 0)) || docker rmi "${PULLED[@]}" >/dev/null 2>&1 || true
  say "removed the test's containers, volumes, network and images"
}
trap cleanup EXIT

infrastructure() {
  pull_once "$PEBBLE_IMAGE"
  pull_once "$DNS_IMAGE"
  pull_once ubuntu:24.04
  pull_once ubuntu:22.04
  docker network create --label "$LABEL" --subnet 10.77.0.0/24 "$NET" >/dev/null
  docker run -d --name seasonal-install-test-dns --label "$LABEL" --network "$NET" --ip 10.77.0.53 \
    -v "$(host_path "$HERE/Corefile"):/etc/coredns/Corefile:ro" "$DNS_IMAGE" -conf /etc/coredns/Corefile >/dev/null
  # No random nonce rejections or validation delays: the test is about the installer.
  docker run -d --name seasonal-install-test-pebble --label "$LABEL" --network "$NET" --ip 10.77.0.20 \
    -e PEBBLE_VA_NOSLEEP=1 -e PEBBLE_WFE_NONCEREJECT=0 \
    -v "$(host_path "$HERE/pebble.json"):/test/config/seasonal.json:ro" "$PEBBLE_IMAGE" \
    -config /test/config/seasonal.json -dnsserver 10.77.0.53:53 >/dev/null
}

start_server() {
  local ubuntu="$1" tries=60 state
  docker build -q --label "$LABEL" --build-arg "UBUNTU=$ubuntu" -t "$SERVER_IMAGE:$ubuntu" \
    -f "$(host_path "$HERE/server.Dockerfile")" "$(host_path "$HERE")" >/dev/null
  # Docker inside needs real file systems for its images (overlay on overlay does not work).
  docker run -d --name "$SERVER" --hostname server --label "$LABEL" --privileged --cgroupns private \
    --tmpfs /run --tmpfs /run/lock --network "$NET" --ip 10.77.0.10 --dns 10.77.0.53 \
    --mount "type=volume,dst=/var/lib/docker,volume-label=$LABEL" \
    --mount "type=volume,dst=/var/lib/containerd,volume-label=$LABEL" \
    "$SERVER_IMAGE:$ubuntu" >/dev/null
  until state="$(on_server systemctl is-system-running 2>/dev/null)"; [[ "$state" == running || "$state" == degraded ]]; do
    ((tries-- > 0)) || { say "systemd did not come up in the test server ($state)"; return 1; }
    sleep 1
  done
  # The working tree as git would check it out (tracked and new files; nothing ignored, so no
  # .env, no data), committed inside so the installer sees a commit.
  (cd "$REPO" && git ls-files -co --exclude-standard -z | tar --null -T - -cf -) |
    on_server sh -c "mkdir -p $REMOTE && tar -C $REMOTE -xf - --no-same-owner"
  (cd "$REPO" && git ls-files -s | awk '$1 == "100755" { print $4 }') | on_server sh -c "
    cd $REMOTE && find . -type f -not -path './.git/*' -exec chmod 644 {} + && xargs -r chmod 755 &&
    git init -q && git add -A && git -c user.name=test -c user.email=test@example.org commit -qm test"
  on_server install -d -m 700 /etc/seasonal-test /etc/docker
  for file in checks.sh checks-bot-admin.sh prepare-nginx.sh prepare-ufw.sh run-installer.exp stub-bot.py; do
    on_server install -m 755 "$REMOTE/deploy/test/$file" "/etc/seasonal-test/$file"
  done
  docker cp seasonal-install-test-pebble:/test/certs/pebble.minica.pem - | on_server tar -C /etc/seasonal-test -xf -
  # The test DNS also for the containers Docker will start inside (they cannot use Docker's own).
  # Docker's embedded DNS never forwards a single-label name such as "pebble": the search domain
  # turns it into pebble.test, while TLS still checks "pebble" (the name in Pebble's certificate).
  echo '{"dns": ["10.77.0.53"], "dns-search": ["test"]}' | on_server sh -c 'cat > /etc/docker/daemon.json'
  on_server age-keygen -o /etc/seasonal-test/age-key.txt 2>/dev/null
}

# run_installer [options...]: the installer on a terminal, its output into the results.
# COINGECKO and BOT_ADMIN (ask|never|any) are what run-installer.exp requires of the CoinGecko
# and the event bot's admin page questions.
run_installer() {
  local status=0
  on_server env TEST_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD" TEST_PASSWORD_MISTAKES="${PASSWORD_MISTAKES:-0}" \
    TEST_COINGECKO="${COINGECKO:-any}" TEST_BOT_ADMIN="${BOT_ADMIN:-any}" \
    /etc/seasonal-test/run-installer.exp "$REMOTE/deploy/install.sh" "$@" 2>&1 | tr -d '\r' |
    sed 's/^/    /' | tee -a "$RESULTS" || status=$?
  return "$status"
}

check() { on_server /etc/seasonal-test/checks.sh "$@" | tee -a "$RESULTS"; }
# The bot admin logins need the test admin's password (passed by name, never on a command line).
check_login() { docker exec -i -e TEST_ADMIN_PASSWORD "$SERVER" /etc/seasonal-test/checks.sh bot-admin-login | tee -a "$RESULTS"; }

# fails <check> [args]: the check must fail (its own FAIL line is kept out of the results).
fails() { ! on_server /etc/seasonal-test/checks.sh "$@" >/dev/null; }

# ok "what" command...: a check made here rather than in checks.sh.
ok() {
  local what="$1"
  shift
  if "$@"; then say "PASS $what"; else say "FAIL $what"; return 1; fi
}

same_secrets() { [[ "$(check secrets-hash)" == "$1" ]]; }
livekit_started_at() { on_server docker inspect -f '{{.State.StartedAt}}' seasonal-calls-livekit-1; }
same_livekit() { [[ "$(livekit_started_at)" == "$1" ]]; }

# The results from line FROM on: the typed password is not in them, only its * echo.
password_hidden() {
  local out
  out="$(tail -n +"$1" "$RESULTS")"
  [[ "$out" != *"$TEST_ADMIN_PASSWORD"* && "$out" == *'**********'* ]]
}

# The installer's nginx files under the names an earlier version gave them (before 2026-11-01),
# as a server installed with it has them: requests by IP address then reach the calls file.
old_nginx_names() {
  # shellcheck disable=SC2016 # $n is the server shell's own variable
  on_server sh -ec 'for n in site calls; do
      mv /etc/nginx/sites-available/zz-seasonal-$n.conf /etc/nginx/sites-available/seasonal-$n.conf
      rm /etc/nginx/sites-enabled/zz-seasonal-$n.conf
      ln -s /etc/nginx/sites-available/seasonal-$n.conf /etc/nginx/sites-enabled/seasonal-$n.conf
    done
    nginx -t 2>/dev/null
    systemctl reload nginx'
}

# An "origin" for --update inside the server: a bare repository whose default branch (master)
# holds the commit about to be installed; the checkout tracks it, as a clone from GitHub does.
make_origin() {
  on_server sh -ec "git init -q --bare -b master /srv/origin.git
    cd $REMOTE
    git branch -M master
    git remote add origin /srv/origin.git
    git push -q -u origin master"
}

# One newer commit on origin's master, as a release would add; prints its hash.
newer_origin_commit() {
  on_server sh -ec "rm -rf /srv/upstream
    git clone -q /srv/origin.git /srv/upstream
    cd /srv/upstream
    echo 'a newer commit for the --update test' > deploy/test/update-marker.txt
    git add -A
    git -c user.name=test -c user.email=test@example.org commit -qm newer
    git push -q origin master
    git rev-parse HEAD"
}

# The event bot, as far as the site sees it: a stub on 127.0.0.1:8090 (stub-bot.py) and an env
# file holding its admin token (random, root only, never printed) among other keys, as the
# owner's bot has; the answers file names that file and key, as the owner does.
start_stub_bot() {
  # shellcheck disable=SC2016 # the server's shell makes the token
  on_server sh -ec 'umask 077
    printf "# the test bot\nSTANNOUNCEBOT_WEB_EMBEDDED=1\nSTANNOUNCEBOT_WEB_ADMIN_TOKEN=%s\nSTANNOUNCEBOT_WEB_BASE_PATH=/bot-admin\n" \
      "$(openssl rand -base64 24)" > /etc/test-bot.env
    systemd-run --quiet --unit=test-stub-bot python3 -I /etc/seasonal-test/stub-bot.py
    for i in $(seq 30); do curl -fs http://127.0.0.1:8090/bot-admin/health >/dev/null && exit 0; sleep 1; done
    exit 1'
  on_server sh -c 'cat > /etc/seasonal-test/bot-answers' <<'EOF'
BOT_ADMIN_URL=http://127.0.0.1:8090
BOT_ADMIN_TOKEN_FILE=/etc/test-bot.env
BOT_ADMIN_TOKEN_KEY=STANNOUNCEBOT_WEB_ADMIN_TOKEN
EOF
}

# The installer's site file without its X-Acting-User line (kept aside), and back: the header
# check must see the browser's own header reach the bot in between.
SITE_CONF=/etc/nginx/sites-available/zz-seasonal-site.conf
drop_acting_user_line() {
  # shellcheck disable=SC2016 # $seasonal_acting_user is nginx's variable, not the shell's
  on_server sh -ec 'cp '"$SITE_CONF"' /etc/seasonal-test/site.conf.kept
    sed -i "/proxy_set_header X-Acting-User \$seasonal_acting_user;/d" '"$SITE_CONF"'
    if grep -q "X-Acting-User \$seasonal" '"$SITE_CONF"'; then exit 1; fi
    nginx -t 2>/dev/null
    systemctl reload nginx'
}
restore_site_conf() {
  on_server sh -ec "cp /etc/seasonal-test/site.conf.kept $SITE_CONF && nginx -t 2>/dev/null && systemctl reload nginx"
}

head_commit() { on_server git -C "$REMOTE" rev-parse HEAD; }
site_started_at() { on_server docker inspect -f '{{.State.StartedAt}}' seasonal-site-site-1; }
answers_hash() { on_server sha256sum /etc/seasonal/install.conf; }

# --update with a modified tracked file: it must stop with the reason and change nothing (the
# same commit, the site not rebuilt or restarted).
update_refused() {
  local commit="$1" started="$2" out
  if out="$(on_server "$REMOTE/deploy/install.sh" --update 2>&1)"; then return 1; fi
  printf '%s\n' "$out" | grep STOPPED | sed 's/^/    /' | tee -a "$RESULTS"
  [[ "$out" == *'tracked files'*'are modified'* && "$(head_commit)" == "$commit" &&
    "$(site_started_at)" == "$started" ]]
}

# The update's own backup, before the new code: named in the output from line FROM on, and there.
update_backup_taken() {
  local file
  file="$(tail -n +"$1" "$RESULTS" | sed -n 's/.*backup before the update: \(\/var\/backups\/seasonal\/[^ ]*\.tar\.age\).*/\1/p' | head -n 1)"
  [[ -n "$file" ]] && on_server test -s "$file"
}

# output_has FROM TEXT / output_lacks FROM TEXT: the results from line FROM on (one run's
# output) hold TEXT, or do not.
output_has() { tail -n +"$1" "$RESULTS" | grep -qF -- "$2"; }
output_lacks() { ! output_has "$@"; }

# The encrypted backups on the server.
backup_count() { on_server sh -c "find /var/backups/seasonal -maxdepth 1 -name '*.tar.age' 2>/dev/null | wc -l"; }
backups_added() { [[ "$(backup_count)" == $(($1 + $2)) ]]; }

# As the first deployment's installer (2026-11-01) left a server whose ufw had 80,443/tcp: its
# own 80/tcp and 443/tcp beside it (IPv4 and IPv6), recorded as the installer's.
redundant_ufw_rules() {
  on_server sh -ec 'ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    printf "80/tcp\n443/tcp\n" >> /etc/seasonal/ufw-added'
}

# The answers file: the same keys a person would fill in (deploy/install/answers.example).
answers() {
  local calls="$1" recording="$2" www="$3" backups="$4" price_bot="$5" recipient=""
  [[ "$backups" == yes ]] && recipient="$(on_server age-keygen -y /etc/seasonal-test/age-key.txt)"
  on_server sh -c 'cat > /etc/seasonal-test/answers' <<EOF
SITE_DOMAIN=example.org
WWW_REDIRECT=$www
CALLS_DOMAIN=$calls
RECORDING=$recording
ACME_EMAIL=admin@example.org
ADMIN_NAME=admin
ADMIN_EMAIL=admin@example.org
PRICE_BOT_DB=$price_bot
PRICE_BOT_MINING_RATES=
EVENT_BOT_DB=
BACKUP_RECIPIENT=$recipient
ACME_SERVER=https://pebble:14000/dir
ACME_CA_BUNDLE=/etc/seasonal-test/pebble.minica.pem
EOF
}

scenario() {
  local name="$1" ubuntu mode calls="" recording=no www=no backups=no price_bot="" ufw=no from
  # What the installer must add to ufw beside the server's own rules (prepare-ufw.sh): for
  # checks.sh "ufw" (<4|6|46>:<proto>:<port>) and as recorded for --uninstall ("ufw-own").
  local ufw_added=() ufw_own=() PASSWORD_MISTAKES=0
  # --yes, except in the nginx scenario: there every run is on a terminal as a person's would
  # be, so the CoinGecko question is asked once (COINGECKO=ask) and must not come again.
  local yes=(--yes) COINGECKO=any BOT_ADMIN=any
  case "$name" in
    caddy) ubuntu=24.04 mode=caddy calls=calls.example.org recording=yes www=yes backups=yes ;;
    nginx) ubuntu=24.04 mode=nginx calls=calls.example.org www=yes price_bot=/srv/bots/snapshots.db ufw=yes
      backups=yes # --update takes one first
      # 80, 443, 7881 and the media range are covered already; 5349/tcp only for IPv4.
      ufw_added=(46:udp:3478 6:tcp:5349) ufw_own=(3478/udp 'to ::/0 port 5349 proto tcp')
      yes=() COINGECKO=ask BOT_ADMIN=ask ;;
    jammy) ubuntu=22.04 mode=caddy ufw=yes PASSWORD_MISTAKES=1
      # "Nginx Full" covers 80/tcp and 443/tcp; HTTP/3 needs 443/udp.
      ufw_added=(46:udp:443) ufw_own=(443/udp) ;;
    *) say "unknown scenario $name"; return 1 ;;
  esac
  say "=== scenario $name: Ubuntu $ubuntu, expected mode $mode, calls ${calls:-none}, recording $recording"
  start_server "$ubuntu"
  if [[ "$mode" == nginx ]]; then
    on_server /etc/seasonal-test/prepare-nginx.sh | tee -a "$RESULTS"
    on_server sh -c 'mkdir -p /srv/bots && : > /srv/bots/snapshots.db'
    make_origin
  fi
  [[ "$ufw" == no ]] || on_server /etc/seasonal-test/prepare-ufw.sh "$name" | tee -a "$RESULTS"
  answers "$calls" "$recording" "$www" "$backups" "$price_bot"

  say "--- first install$([[ "$PASSWORD_MISTAKES" == 1 ]] && echo ': a too-short password and a differing confirmation first')"
  from=$(($(wc -l <"$RESULTS") + 1))
  run_installer --answers /etc/seasonal-test/answers "${yes[@]}"
  ok "the admin password never shows in the output (one * per character)" password_hidden "$from"
  ok "the first install says KEEP SAFE for the 2FA key" output_has "$from" 'KEEP SAFE'
  [[ "$backups" == no ]] || ok "the first install names its backup the first one" output_has "$from" 'the first one is'
  check health
  [[ "$www" == no ]] || check www
  [[ "$mode" == caddy ]] || { check other; check unknown-name; }
  # Answered empty on the terminal: remembered as "none", nothing set up.
  [[ "$BOT_ADMIN" != ask ]] || check bot-admin-absent none
  [[ -z "$calls" ]] || check wss
  [[ -z "$calls" ]] || check modes "$REMOTE/deploy/calls/.env"
  [[ -n "$calls" ]] || check modes
  check admin
  [[ "$backups" == no ]] || check backup
  [[ "$recording" == no ]] || check containers seasonal-calls-livekit-1 seasonal-calls-egress-1 seasonal-calls-redis-1
  [[ -z "$price_bot" ]] || ok "the bot's file is mounted read-only" on_server docker exec seasonal-site-site-1 \
    sh -c 'test -f /bots/snapshots.db && ! touch /bots/snapshots.db 2>/dev/null'
  [[ "$ufw" == no ]] || { check ufw "${ufw_added[@]}"; check ufw-own "${ufw_own[@]}"; }
  check status "$mode"
  check marker-write
  local before livekit_started=""
  before="$(check secrets-hash)"
  [[ -z "$calls" ]] || livekit_started="$(livekit_started_at)"

  if [[ "$mode" == nginx ]]; then
    say "--- the nginx files under the old names, as an earlier installer left them"
    old_nginx_names
    ok "with the old names requests by IP address reach the installer's file (the check sees it)" fails unknown-name
    say "--- 80/tcp and 443/tcp added and recorded beside 80,443/tcp, as an earlier installer left them"
    redundant_ufw_rules
    ok "with them ufw differs from the expected rules (the check sees it)" fails ufw "${ufw_added[@]}"
  fi

  say "--- second install (idempotent$([[ "$mode" == nginx ]] && echo '; moves the old nginx file names, removes the redundant ufw rules'))"
  local backups_before
  backups_before="$(backup_count)"
  # Answered (empty) by the first install: from now on it must not be asked.
  [[ "$COINGECKO" == any ]] || COINGECKO=never
  [[ "$BOT_ADMIN" == any ]] || BOT_ADMIN=never
  from=$(($(wc -l <"$RESULTS") + 1))
  run_installer --answers /etc/seasonal-test/answers "${yes[@]}"
  ok "secrets kept on re-run" same_secrets "$before"
  ok "no KEEP SAFE note on a re-run" output_lacks "$from" 'KEEP SAFE'
  if [[ "$backups" == yes ]]; then
    ok "the re-run takes one backup" backups_added "$backups_before" 1
    ok "the re-run's backup is not called the first one" output_lacks "$from" 'the first one is'
    ok "the re-run's backup is called a new one" output_has "$from" 'a new one now is'
  fi
  if [[ "$mode" == nginx ]]; then
    ok "the re-run says it removed 80/tcp" output_has "$from" 'firewall: removed 80/tcp'
    ok "the re-run says it removed 443/tcp" output_has "$from" 'firewall: removed 443/tcp'
  fi
  # An update must not cut running calls: LiveKit keeps running when nothing of it changed.
  [[ -z "$calls" ]] || ok "LiveKit not restarted by the re-run" same_livekit "$livekit_started"
  check health
  check marker
  [[ "$mode" == caddy ]] || { check other; check unknown-name; check nginx-files; }
  [[ "$ufw" == no ]] || { check ufw "${ufw_added[@]}"; check ufw-own "${ufw_own[@]}"; }

  if [[ "$mode" == nginx ]]; then
    # On this server without the bot the remembered "none" was not asked (run-installer.exp).
    check bot-admin-absent none
    say "--- the event bot's admin page: a stub bot, configured with an answers file (its env file and key)"
    start_stub_bot
    from=$(($(wc -l <"$RESULTS") + 1))
    run_installer --answers /etc/seasonal-test/bot-answers
    ok "the run names the bot's page" output_has "$from" 'https://example.org/bot-admin/ (staff only)'
    check_login
    check bot-admin-page
    check bot-admin-refused
    check bot-admin-headers
    check bot-admin-post
    check bot-admin-secret
    check other
    check unknown-name
    say "--- the installer's X-Acting-User line taken out by hand, then put back"
    drop_acting_user_line
    ok "without it the header check sees the browser's own X-Acting-User (it can fail)" fails bot-admin-headers
    restore_site_conf
    check bot-admin-headers

    say "--- --update to a newer commit of origin's default branch"
    local old_commit new_commit answers_before
    old_commit="$(head_commit)"
    new_commit="$(newer_origin_commit | tail -n 1)"
    on_server sh -c "echo 'a local change' >> $REMOTE/README.md"
    ok "--update refuses a modified tracked file and changes nothing" update_refused "$old_commit" "$(site_started_at)"
    on_server git -C "$REMOTE" checkout -q -- README.md
    before="$(check secrets-hash)"
    answers_before="$(answers_hash)"
    backups_before="$(backup_count)"
    from=$(($(wc -l <"$RESULTS") + 1))
    run_installer --update
    ok "--update took a backup before the new code" update_backup_taken "$from"
    ok "--update took exactly one backup" backups_added "$backups_before" 1
    ok "--update's re-run names that backup" output_has "$from" "this update's backup"
    ok "no KEEP SAFE note on --update" output_lacks "$from" 'KEEP SAFE'
    check ufw "${ufw_added[@]}"
    check ufw-own "${ufw_own[@]}"
    ok "secrets kept by --update" same_secrets "$before"
    ok "remembered answers unchanged by --update" test "$(answers_hash)" = "$answers_before"
    check served-commit "$new_commit"
    check unknown-name
    check_login
    check bot-admin-page
    check bot-admin-headers
  fi

  say "--- uninstall"
  on_server "$REMOTE/deploy/install.sh" --uninstall | tee -a "$RESULTS"
  check uninstalled
  check marker
  [[ "$mode" == caddy ]] || { check other; check unknown-name; }
  [[ "$ufw" == no ]] || check ufw
  [[ "$ufw" == no ]] || ok "the installer's firewall rules are removed" on_server test ! -s /etc/seasonal/ufw-added
  [[ "$mode" == caddy ]] || check bot-admin-absent

  say "--- install after uninstall (data kept)"
  from=$(($(wc -l <"$RESULTS") + 1))
  run_installer --answers /etc/seasonal-test/answers "${yes[@]}"
  ok "no KEEP SAFE note when installing again (the key was kept)" output_lacks "$from" 'KEEP SAFE'
  check health
  check marker
  check admin
  [[ -z "$calls" ]] || check wss
  [[ "$mode" == caddy ]] || { check other; check unknown-name; }
  if [[ "$mode" == nginx ]]; then
    # The token comes back from the bot's env file named in the remembered answers.
    check_login
    check bot-admin-page
    check bot-admin-refused
    check bot-admin-secret
    # All the runs' output so far, searched on the server (the token never comes to this PC).
    local output
    output="$(mktemp)"
    cp "$RESULTS" "$output"
    on_server /etc/seasonal-test/checks.sh bot-admin-output <"$output" | tee -a "$RESULTS"
    rm -f "$output"
  fi
  say "=== scenario $name: all checks passed"
}

stop_server() { docker rm -f "$SERVER" >/dev/null 2>&1 || true; docker volume ls -q --filter "label=$LABEL" | xargs -r docker volume rm >/dev/null 2>&1 || true; }

main() {
  local name failed=()
  (($#)) || set -- caddy nginx jammy
  say "results: $RESULTS"
  infrastructure
  for name in "$@"; do
    # A failed scenario is recorded and the next one still runs. In the background, because
    # bash ignores set -e inside a subshell whose status is tested.
    scenario "$name" &
    if ! wait "$!"; then
      say "=== scenario $name: FAILED (see above)"
      failed+=("$name")
    fi
    [[ "${KEEP:-}" == 1 ]] || stop_server
  done
  if ((${#failed[@]})); then
    say "FAILED: ${failed[*]}"
    exit 1
  fi
  say "all scenarios passed: $*"
}

main "$@"
