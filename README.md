# Workblock

A Brave/Chrome extension that blocks distracting sites during your working
hours, and gets out of the way outside them.

No sudo, no daemon, no account, no server. It reads your computer's clock and
flips a `declarativeNetRequest` rule set on and off.

## Install

Not on the Web Store. Load it from source:

1. Clone this repo.
2. Open `brave://extensions` (or `chrome://extensions`).
3. Turn on **Developer mode**, top right.
4. Click **Load unpacked** and pick the cloned folder.

Click the toolbar icon to set your sites, hours, and days. Defaults are the
usual suspects, 09:00-17:00, Monday to Friday.

The badge reads `ON` while a block is active.

## How it works

`background.js` wakes once a minute on a `chrome.alarms` tick, asks
`schedule.js` whether the current local time is inside your window, and either
installs one dynamic block rule per site or clears them all. Rules match with
`requestDomains`, so `x.com` also covers `www.x.com` and `mobile.x.com`, and
only `main_frame` requests are blocked, so embedded content and APIs on those
domains keep working.

Network rules alone are not enough. Sites that ship their own service worker,
such as YouTube and a logged-in x.com, answer navigations straight from their
cache, and that request never reaches the layer `declarativeNetRequest` sits
on. So on the way into a block, Workblock also drops the service workers and
cache storage for the blocked origins, which forces the next navigation back
onto the network. Tabs already open when the window starts are bounced to
`blocked.html`.

That is what the three extra permissions buy:

| Permission | Why |
| --- | --- |
| `declarativeNetRequest` | the actual blocking |
| `tabs` | find tabs already sitting on a blocked site |
| `browsingData` | drop service workers that would serve the site from cache |

All the logic that can actually be wrong lives in `schedule.js`, which imports
no browser APIs. That is what `test.mjs` exercises.

```sh
npm test
```

## Why not an /etc/hosts blocker

That was the first version of this repo, in the git history. It needed a root
LaunchDaemon, and Chrome's Secure DNS setting defaults to `automatic`, which
resolves over HTTPS and walks straight around `/etc/hosts`. The block was
written correctly and the browser ignored it.

## Known ceilings

- **You can turn it off in two clicks**, from `brave://extensions`. This kills
  idle drift, not real craving. To make it stick, force-install the extension
  with a managed-policy profile (`ExtensionInstallForcelist`) and block
  `brave://extensions` via `URLBlocklist` in the same profile.
- **One window per day.** No lunch break, no split shifts, no overnight window
  that wraps past midnight. `test.mjs` asserts the wrapping case is unsupported
  rather than silently wrong.
- **This browser only.** Safari, your phone, and any other browser are
  untouched. Block at the DNS level if you want real coverage.
- **The service worker purge is destructive.** Entering a block clears offline
  caches for the blocked origins only. YouTube offline downloads are collateral.

## License

MIT
