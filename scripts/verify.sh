#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --ignore-scripts --offline
node scripts/rules.mjs
npm test
echo "verify: green"
