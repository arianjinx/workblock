# workblock

Blocks a list of sites 9:00-17:00, Mon-Fri, by rewriting `/etc/hosts`.
Browser-agnostic: Chrome, Brave, Safari, and every app on the machine.

Edit `sites.txt` to change the list, and the three constants at the top of
`workblock.sh` to change the hours or days.

## Install

```sh
sudo cp com.arianjinx.workblock.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.arianjinx.workblock.plist
sudo launchctl load -w /Library/LaunchDaemons/com.arianjinx.workblock.plist
```

Runs every 60s as root, so a block starts and lifts within a minute of the hour.

## Uninstall

```sh
sudo launchctl unload -w /Library/LaunchDaemons/com.arianjinx.workblock.plist
sudo rm /Library/LaunchDaemons/com.arianjinx.workblock.plist
sudo cp /etc/hosts.workblock-backup /etc/hosts
```

The first run backs up `/etc/hosts` to `/etc/hosts.workblock-backup`.
Outside the window the file is restored byte-for-byte, so the backup is a
safety net, not the normal unblock path.

## Test

```sh
./test.sh
```

Runs against a temp hosts file. No sudo, does not touch `/etc`.
Overrides `WORKBLOCK_HOUR` / `WORKBLOCK_DAY` to test every window boundary.

## Known ceilings

- **Bypass cost is one `sudo` away.** This stops idle drift, not determined
  craving. If you need a real wall, the block has to be something you cannot
  unlock - see Cold Turkey's locked mode.
- **Already-open tabs keep working.** Blocking only affects new DNS lookups.
  Chrome also keeps its own DNS cache; a tab open since 08:55 may survive.
- **Desktop only.** Your phone is the actual leak. Handle it separately.
