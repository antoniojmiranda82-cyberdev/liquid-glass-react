#!/usr/bin/env bash
# React development-mode behaviour + Lenis/GSAP compatibility. Needs `setup.sh` to have run (builds package, installs and builds the apps).
#   next dev  (3102, React 19)      vite dev SSR (3104, React 18)      smooth-app: preview 3105 (prod build), dev 3106
# Chromium by default for dev mode; all three engines for Lenis/GSAP. Override with BROWSERS=...
set -uo pipefail
cd "$(dirname "$0")"
stop() { pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; pkill -f "server-dev.mjs" 2>/dev/null; pkill -f "vite preview" 2>/dev/null; pkill -f "vite --port" 2>/dev/null; sleep 1; }
stop
(cd verify && npm install --no-audit --no-fund --silent)
(cd next-app && nohup npx next dev -p 3102 >/tmp/next-dev.log 2>&1 &)
(cd vite-app && nohup node server-dev.mjs >/tmp/vite-dev.log 2>&1 &)
(cd smooth-app && nohup npx vite preview --port 3105 --strictPort >/tmp/smooth-prod.log 2>&1 &)
(cd smooth-app && nohup npx vite --port 3106 --strictPort >/tmp/smooth-dev.log 2>&1 &)
sleep 12
fail=0
[ "${SKIP_DEV:-0}" = "1" ] || (cd verify && BROWSERS="${DEV_BROWSERS:-chromium}" node verify-dev.cjs) || fail=1
(cd verify && BROWSERS="${SMOOTH_BROWSERS:-chromium,firefox,webkit}" node verify-smooth.cjs) || fail=1
stop
exit $fail
