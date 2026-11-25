#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/rules.mjs
npm test
echo "verify: green"
