#!/usr/bin/env bash
# Builds the package, packs it, installs it into both test apps and builds them.
# Next app imports the lean "liquid-glass-react/premium" entry; Vite app imports the root entry.
# Nothing here touches any repo other than this fork.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -f test-apps/liquid-glass-react.tgz
npm pack --silent --pack-destination test-apps >/dev/null
mv test-apps/liquid-glass-react-*.tgz test-apps/liquid-glass-react.tgz

sed 's#"liquid-glass-react"#"liquid-glass-react/premium"#' test-apps/shared/demo.tsx > test-apps/next-app/demo.tsx
cp test-apps/shared/demo.tsx test-apps/vite-app/src/demo.tsx

for app in next-app vite-app smooth-app; do
  (cd "test-apps/$app" && rm -rf node_modules package-lock.json .next dist && npm install --no-audit --no-fund --silent && npm run build --silent)
done
echo "setup ok"
