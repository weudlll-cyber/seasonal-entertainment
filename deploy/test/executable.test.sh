#!/bin/bash
# ============================================================
# File:        executable.test.sh
# Path:        deploy/test/executable.test.sh
# Project:     Seasonal Entertainment
# Description: The scripts that are started directly, not through "bash file" (the docs' commands,
#              a systemd timer, certbot's hook, the PC-side copy), are executable in git (mode
#              100755), so "sudo ./deploy/..." works right after a clone; deploy/calls/loadtest.sh
#              was 100644 and failed live with "command not found" (2026-11-10). Reads the modes
#              git records, so it answers the same on Windows. Plain checks, no framework.
#              Run: bash deploy/test/executable.test.sh; CI runs it. Exit code 1 on any failure.
# ============================================================

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
failures=0

# docs/DEPLOYMENT.md, docs/CALLS.md ("Load test") and the timers and hooks the installer sets up.
for script in deploy/install.sh deploy/calls/loadtest.sh deploy/site/calls-cert.sh \
  deploy/install/certbot-hook.sh deploy/pc/get-seasonal-backups.sh   deploy/site/watchdog/seasonal-watchdog.sh; do
  mode="$(git -C "$ROOT" ls-files -s -- "$script" | cut -d' ' -f1)"
  if [[ "$mode" == 100755 ]]; then
    echo "ok   $script is executable"
  else
    echo "FAIL $script has mode ${mode:-<not in git>}, not 100755 (git update-index --chmod=+x)"
    failures=$((failures + 1))
  fi
done

[[ "$failures" -eq 0 ]] || { echo "$failures failed"; exit 1; }
echo 'all passed'
