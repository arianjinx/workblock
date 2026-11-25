#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --ignore-scripts --offline
node scripts/rules.mjs
git ls-files -co --exclude-standard -- '*.js' '*.mjs' | while read -r file; do
  if [ -f "$file" ]; then
    node --check "$file" || { echo "verify: $file does not parse" >&2; exit 1; }
  fi
done
node -e 'JSON.parse(require("node:fs").readFileSync("manifest.json", "utf8"))'
npm test
echo "verify: green"
