# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Workblock is a Manifest V3 Brave/Chrome extension that blocks distracting sites during a configured weekly window. It is plain ES modules loaded straight from the repo folder: no build step, no bundler, no dependencies, no linter config.

## Commands

```sh
npm test                              # node test.mjs — unit asserts against schedule.js
npm run e2e                           # node e2e.mjs — drives a real Brave (macOS default path)
npm run e2e -- "/path/to/Chromium"    # any other Chromium build
```

There is no test runner or test filter. `test.mjs` is a flat list of `node:assert/strict` calls and stops at the first failure. To run a subset, comment out the other asserts or run `node -e` against `schedule.js`.

To try changes by hand, load the folder unpacked from `brave://extensions` (Developer mode) and click reload after each edit.

## Architecture

- **`schedule.js` is pure.** It imports no `chrome.*` APIs, so Node can import it. Put any logic that can be wrong here, such as time windows, rule building, host matching, site parsing, and the blocked-page URL round trip, and cover it in `test.mjs`. The other scripts are thin `chrome.*` glue that imports from it.
- **`background.js`** (module service worker) recomputes everything on each event: a 1-minute `chrome.alarms` tick, startup, install, and every `storage.onChanged`. `applySchedule` reads config from `chrome.storage.sync.get(DEFAULTS)` and replaces the whole dynamic rule set. Calls are chained through the `latest` promise in `sync()` because two overlapping runs would both remove the same old rules and then collide on rule id 1. Keep any new trigger behind `sync()`.
- **Blocking has three layers. Each one covers a gap the previous layer leaves:**
  1. `declarativeNetRequest` dynamic rules: `requestDomains` covers subdomains, and only `main_frame` is blocked.
  2. A tab sweep plus `browsingData.remove` of service workers and cache storage for blocked origins. Sites with their own service worker, such as YouTube and logged-in x.com, answer navigations from cache and never reach DNR. The **sweep must run before the purge**, because an open tab re-registers the worker.
  3. `tabs.onUpdated` bounces new navigations to `blocked.html` so the user does not land on `ERR_BLOCKED_BY_CLIENT`.
- **The blocked page carries the original link.** It loads as `blocked.html?url=<original>`, built by `blockedPageUrl`, so the URL survives saved tab groups and session restore. `blocked.js` sends the tab back once the site is no longer blocked, and only while the tab is visible (`document.hidden`), so background tabs don't all reload at the end of the window. `returnUrl` accepts only `http(s)` URLs. Bare `blocked.html` with no `url` param is a legacy path for tabs swept by older versions, and it falls back to `history.back()`.
- **`options.html`/`options.js`** is both the toolbar popup and the options page. It writes `{sites, startHour, endHour, days}` to `chrome.storage.sync`, and the background reacts through `storage.onChanged`.

## Constraints and conventions

- The window is one range per day. `startHour` is inclusive and `endHour` is exclusive, both in local time, and `days` uses `Date#getDay` (0=Sun). Wrap-past-midnight windows are deliberately unsupported, and `test.mjs` asserts that.
- Adding a `chrome.*` permission means updating the permissions table in `README.md`, which justifies each one.
- `e2e.mjs` talks raw CDP over WebSocket on port 9333 with a throwaway profile, and blocks `example.com` with an always-on window. New e2e scenarios reuse its `setCfg`/`openTab`/`landsOn`/`waitFor` helpers. The final assertion checks that the background service worker threw no exceptions during the run.
- Git history follows a test-first pattern: a `test: e2e check that …` commit lands before the matching `fix: …`. Commit prefixes are `feat:`, `fix:`, and `test:`. JS uses tab indentation and `manifest.json` uses two spaces.
