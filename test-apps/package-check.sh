#!/usr/bin/env bash
# Package compatibility: publint, are-the-types-wrong, native Node ESM + CJS, TS consumers.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
echo "== publint"; npx --yes publint --pack npm || fail=1
echo "== are-the-types-wrong"; npx --yes @arethetypeswrong/cli --pack . --profile node16 || fail=1
echo "== node ESM (vite-app, React 18)"; (cd test-apps/vite-app && node compat.mjs) || fail=1
echo "== node CJS (vite-app, React 18)"; (cd test-apps/vite-app && node compat.cjs) || fail=1
echo "== tsc strict: vite-app (React 18 types)"; (cd test-apps/vite-app && npx tsc --noEmit) && echo PASS || fail=1
echo "== tsc strict: next-app (React 19 types)"; (cd test-apps/next-app && npx tsc --noEmit) && echo PASS || fail=1
echo "== files in tarball"; npm pack --dry-run 2>&1 | grep -E "dist/|total files|package size" | head -30
exit $fail
