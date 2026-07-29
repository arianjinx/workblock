#!/bin/sh
# Self-check: runs workblock.sh against a throwaway hosts file. No sudo, no /etc.
set -eu

DIR=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

export WORKBLOCK_HOSTS="$WORK/hosts"
export WORKBLOCK_SITES="$WORK/sites.txt"
printf '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n' >"$WORKBLOCK_HOSTS"
printf '# comment\nx.com\n\nreddit.com\n' >"$WORKBLOCK_SITES"

fail() { echo "FAIL: $1"; exit 1; }
run() { WORKBLOCK_HOUR=$1 WORKBLOCK_DAY=$2 sh "$DIR/workblock.sh"; }
has() { grep -qF "$1" "$WORKBLOCK_HOSTS"; }

run 10 3
has '0.0.0.0 x.com'     || fail "10:00 Wed should block x.com"
has '0.0.0.0 www.x.com' || fail "www. variant missing"
has '0.0.0.0 reddit.com'|| fail "10:00 Wed should block reddit.com"
has '# comment'         && fail "comment line leaked from sites.txt"
has '127.0.0.1 localhost' || fail "clobbered the original hosts content"

before=$(cat "$WORKBLOCK_HOSTS")
run 10 3
[ "$(cat "$WORKBLOCK_HOSTS")" = "$before" ] || fail "not idempotent - second run changed the file"

run 20 3
has '0.0.0.0 x.com' && fail "20:00 should be unblocked"
run 8 3
has '0.0.0.0 x.com' && fail "08:00 (before start) should be unblocked"
run 17 3
has '0.0.0.0 x.com' && fail "17:00 (end is exclusive) should be unblocked"
run 10 6
has '0.0.0.0 x.com' && fail "Saturday should be unblocked"

run 9 1
has '0.0.0.0 x.com' || fail "09:00 Mon (window start) should block"
run 16 5
has '0.0.0.0 x.com' || fail "16:00 Fri (last blocked hour) should block"

run 20 3
[ "$(cat "$WORKBLOCK_HOSTS")" = "$(printf '127.0.0.1 localhost\n255.255.255.255 broadcasthost\n')" ] \
	|| fail "unblocked file does not match the original byte-for-byte"

[ -f "$WORKBLOCK_HOSTS.workblock-backup" ] || fail "no backup was written"

echo "ok - all checks passed"
