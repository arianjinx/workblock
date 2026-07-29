#!/bin/sh
# workblock - block distracting sites during working hours via /etc/hosts.
# Run periodically by launchd as root. Idempotent: safe to run every minute.
set -eu

START_HOUR=9      # inclusive
END_HOUR=17       # exclusive (17 = blocked until 16:59, free at 17:00)
WORK_DAYS="1 2 3 4 5"   # date +%u, 1=Mon .. 7=Sun

DIR=$(cd "$(dirname "$0")" && pwd)
SITES=${WORKBLOCK_SITES:-"$DIR/sites.txt"}
HOSTS=${WORKBLOCK_HOSTS:-/etc/hosts}

BEGIN='# >>> workblock >>>'
FINISH='# <<< workblock <<<'

in_window() {
	h=${WORKBLOCK_HOUR:-$(date +%H)}
	h=${h#0}; h=${h:-0}   # 09 -> 9, 00 -> 0 (POSIX; no 10# bashism)
	d=${WORKBLOCK_DAY:-$(date +%u)}
	case " $WORK_DAYS " in *" $d "*) ;; *) return 1 ;; esac
	[ "$h" -ge "$START_HOUR" ] && [ "$h" -lt "$END_HOUR" ]
}

render_block() {
	printf '%s\n' "$BEGIN"
	while IFS= read -r site || [ -n "$site" ]; do
		case "$site" in '' | '#'*) continue ;; esac
		printf '0.0.0.0 %s\n0.0.0.0 www.%s\n' "$site" "$site"
	done <"$SITES"
	printf '%s\n' "$FINISH"
}

[ -f "$HOSTS.workblock-backup" ] || cp "$HOSTS" "$HOSTS.workblock-backup"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

sed "\|^$BEGIN\$|,\|^$FINISH\$|d" "$HOSTS" >"$tmp"
in_window && render_block >>"$tmp"

cmp -s "$tmp" "$HOSTS" && exit 0

cat "$tmp" >"$HOSTS"   # truncate-in-place: keeps inode, owner and mode

if [ "$HOSTS" = /etc/hosts ]; then
	dscacheutil -flushcache
	killall -HUP mDNSResponder 2>/dev/null || true
fi
