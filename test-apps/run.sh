#!/usr/bin/env bash
# Starts both production servers, runs the verification in Chromium, Firefox and WebKit, stops the servers.
# Needs the engines: npx playwright install chromium firefox webkit   (verify/package.json pins playwright 1.56.0).
# Restrict engines with BROWSERS=chromium,firefox,webkit (default: all three). Dev mode and Lenis/GSAP: run-compat.sh.
set -uo pipefail
cd "$(dirname "$0")"
pkill -f "next start" 2>/dev/null; pkill -f "next-server" 2>/dev/null; pkill -f "server.mjs" 2>/dev/null
sleep 1
(cd verify && npm install --no-audit --no-fund --silent)
(cd next-app && npx next start -p 3101 >/tmp/next.log 2>&1 &)
(cd vite-app && node server.mjs >/tmp/vite.log 2>&1 &)
sleep 6
(cd verify && node verify.cjs)
code=$?
pkill -f "next start" 2>/dev/null; pkill -f "next-server" 2>/dev/null; pkill -f "server.mjs" 2>/dev/null
exit $code
