# Workblock

[![Manifest V3](https://img.shields.io/badge/manifest-v3-4285F4)](manifest.json)
[![No dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A Brave and Chrome extension that blocks distracting sites during your working
hours and stays out of the way outside them. There is no sudo, no daemon, no
account, and no server. It reads the computer's clock and turns a
`declarativeNetRequest` rule set on and off.

<picture>
	<source media="(prefers-color-scheme: dark)" srcset="docs/demo-dark.gif" />
	<img src="docs/demo-light.gif" width="100%" alt="Workblock in a real browser. The settings popup reads Blocking now. A tab on the Hacker News guidelines moves to a blocked page that names the site and the time the block ends. A new visit to youtube.com lands on the same page. When the block ends, the first tab goes back to the Hacker News guidelines by itself." />
</picture>

Load the cloned folder from `brave://extensions` or `chrome://extensions` with
**Developer mode** and **Load unpacked**. Workblock is not on the Chrome Web
Store. To update, run `git pull` and reload the card. Settings stay.

Click the toolbar icon, edit, and click **Save**.

- **Blocked sites.** One domain per line. `x.com` also blocks every subdomain. A pasted URL keeps only the domain. Lines that start with `#` are skipped.
- **Hours.** Whole hours in local time. The start hour is inclusive and the end hour is exclusive, so `9` to `17` blocks from 09:00 through 16:59.
- **Days.** The same window on each ticked day.

The defaults are 09:00 to 17:00, Monday to Friday: `x.com`, `twitter.com`,
`facebook.com`, `instagram.com`, `threads.net`, `tiktok.com`, `reddit.com`,
`youtube.com`, `linkedin.com`, and `news.ycombinator.com`. The badge reads
`ON` while a block is active.

During a block, an open tab on a blocked site and a new visit both land on the
blocked page. The page names the site and the time the block ends. The tab
keeps its link as `blocked.html?url=<the original URL>`. The visible tab goes
back when the block ends. A background tab goes back when you switch to it.

### Why each permission

| Permission | Why Workblock needs it |
| --- | --- |
| `declarativeNetRequest` | Install and remove the block rules. |
| `alarms` | Wake the service worker once a minute to check the clock. |
| `storage` | Keep your sites, hours, and days in `chrome.storage.sync`. |
| `tabs` | Find tabs on a blocked site and move them to the blocked page. |
| `browsingData` | Remove service workers that would serve a blocked site from cache. |

## Limits

- Untick today, or disable the extension, and the block stops. This stops idle drift.
- One window, in whole hours. A window that wraps past midnight blocks nothing.
- The alarm can lag a block by up to a minute.
- This browser profile only.
- During a block, service workers and cache storage for blocked sites are cleared. Cookies stay.

## Develop

There is no build. The folder is the extension. Reload it after an edit.

```sh
scripts/verify.sh
scripts/score
SCORE_E2E=1 scripts/score
npm run demo
```

`npm run e2e` needs Node 22 or later and Chrome for Testing. `npm run prune`
and `npm run ship` read `GH_TOKEN`. Cloud agents do not run `ship`.

## License

MIT. See [LICENSE](LICENSE).
