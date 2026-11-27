# Frontier

The current score for each rung, then the evidence for every step, newest first. FRONTIER.jsonl holds the same steps as one JSON line each, including rejected attempts.

| Rung | Name | Score | Frontier | Commit |
|---|---|---|---|---|
| R0 | Gate | yes | yes | b6680e0 |
| R1 | Schedule | 65/69 | 69/69 | aa8383c |
| R2 | Flows | 11/23 | 23/23 | b6680e0 |
| R3 | Device | 11/23, e2e passed | 23/23, e2e passes | b6680e0 |
| R4 | UI rules | 5/8 | 8/8 | b6680e0 |
| R5 | Taste | manual | the owner's yes | — |
| R6 | Safari | 56/56 | 56/56 | aa8383c |

## Speed

There is no speed rung. The README's one-minute alarm is a limit, not a target. If a speed rung is added later, a number counts only when the baseline and the candidate run interleaved, at least 6 pairs, on an idle machine, and the whole paired 95% interval is a gain.

## Evidence

### 2026-11-27 Safari redirects instead of bouncing tabs

`afe9404` only slowed the loop. Safari 27.2 froze again at 87% CPU for 103 seconds in `WebExtensionContext::tabsUpdate`. Safari reports a tab's earlier address while it moves (WebKit commit `f062ddd698`) and has no `pendingUrl`, so a bounce from `tabs.onUpdated` cannot tell a moving tab from a tab still on the site.

- Fix: Safari gets a redirect rule per site with access (`regexFilter` and `regexSubstitution` to `blocked.html#\0`, with `declarativeNetRequestWithHostAccess`), and a block rule per site without. It never listens to `tabs.onUpdated`. Chrome and Brave keep block rules and the bounce, now in `chrome-blocking.js`.
- New R6 checks: `safari-redirect-hosts`, `-return`, `-syntax` and `-needs-access`, against `hostMatches` and WebKit's `\0` to `\9` substitution. R1 gained two permission-table checks for `declarativeNetRequestWithHostAccess`, and both pass.
- Command: `SCORE_E2E=1 scripts/score --all`. Machine: `darwin arm64`. Commit: `aa8383c`, clean tree. Chrome for Testing 159.0.8154.6.
- Result: R0 yes, R1 65/69, R2 11/23, R3 11/23 with e2e passing, R4 5/8, R5 manual, R6 56/56. The four R1 `parse-` failures are the same as before.
- Inside Safari: the owner saw a block work on a build of this tree. Not yet checked in detail: an open tab moving, the return when a block ends, access granted for one day running out, and iOS.

### 2026-11-27 Safari froze on a block

The first run inside Safari, Safari 27.2 on macOS 27.2.1, froze the browser after Save. A `cpu_resource` report put Safari at full CPU for about 160 seconds in `WebExtensionContext::tabsUpdate` and `WebExtensionTab::loadURL`.

- Cause: Safari's `tabs.onUpdated` reports a tab's earlier address when the address changes again within its 25 ms delay, and re-fires it for every matching tab after a site-access grant. The bounce trusted that address, so each resend restarted the load and caused the next report.
- Fix in `background.js`: read the tab's live address, and send one tab to the blocked page at most once every 2 seconds.
- Proof in `e2e.mjs`: it dispatches Safari's stale event during and after a sweep and counts sends for that tab. Before: 10. With only the live address: 4. With only the 2 second limit: 2. With both: 1.
- Command: `SCORE_E2E=1 scripts/score --no-gate`, after `scripts/verify.sh` passed. Machine: `darwin arm64`. Commit: `afe9404`, clean tree. Chrome for Testing 159.0.8154.6.
- Result: R1 63/67, R2 11/23, R3 11/23 with e2e passing, R4 5/8, R6 48/48. R6 gained two checks for `tabs.get` and `tabs.onRemoved`, both in Safari 14 and Safari on iOS 15. Nothing went down.
- Not measured yet: the fixed build inside Safari.

### 2026-11-27 Safari on macOS, iOS and iPadOS

The owner moved Safari and phones into scope. R6 checks the code against `@mdn/browser-compat-data` 8.1.11 in `scripts/safari-compat.json`.

- Command: `SCORE_E2E=1 scripts/score --all`. Machine: `linux x64`. Commit: `c45228f`, clean tree. Chrome for Testing 158.0.8127.88 under `xvfb-run`.
- Result: R0 yes, R1 63/67, R2 11/23, R3 11/23 with e2e passing, R4 5/8, R5 manual, R6 46/46. R1 to R4 match the 2026-11-25 numbers.
- R6 before, the same meter on `8ae6659`: 36/42. It failed on the unguarded `browsingData` permission and `chrome.browsingData.remove`, the missing host access Safari needs for `tab.url`, the missing `siteOrigins`, and the two README version sentences.
- The minimum is Safari 16.4 and iOS 16.4, from `manifest.background.type` and `RuleCondition.requestDomains`.
- `e2e.mjs` deletes `chrome.browsingData` and blocks again. Before the guard it timed out waiting for the badge. After, the badge reads `ON`, the tab is swept, and the worker throws nothing.
- Not measured: Workblock running inside Safari. That needs a Mac with Xcode, so the owner tries it by hand.

### 2026-11-25 re-baseline after the frontier review

The baseline below names commit `aaaaaaa`, which is not a commit. This run re-measures every rung on a real one. The numbers match it, except R1, which gained two checks.

- Command: `SCORE_E2E=1 scripts/score`. Machine: macOS, `darwin arm64`. Commit: `b6680e0`, clean tree. About 14 seconds; without `SCORE_E2E=1`, about 2.
- Result: R0 yes, R1 63/67, R2 11/23, R3 11/23 with e2e passing, R4 5/8, R5 manual.
- R1 gained `defaults-sites` and `defaults-window`. They check the README's defaults sentence against `DEFAULTS` in `schedule.js`, and both pass. The same four `parse-` checks fail. `new URL(...).hostname` in Node answers each of them with the domain the README wants.
- R3 ran on Chrome for Testing 159.0.8154.6, from the Playwright cache, with port 9333 held by an unrelated headless Chrome. The meter picked a free port. Before `cdp.mjs` passed `--disable-backgrounding-occluded-windows`, the e2e failed 3 of 3 times on macOS at "background tab to return when viewed": Chrome hides an occluded window, and `blocked.js` returns only from a visible page. The meter read that as 4/23, with `first_fail` `background-waits: e2e did not reach it; Error: timed out waiting for background tab to return when viewed`. With the flag, all 7 flows pass. The "waits until it is viewed" assert still holds, because an inactive tab stays hidden.
- Still not measured, and not in a total: the same R4 list as below, and R5.

### 2026-11-25 baseline

`scripts/score` runs the gate and leaves R3 unmeasured. R3 below is from a second command, `SCORE_E2E=1 scripts/score --no-gate`.

- Command: `scripts/score`
- Machine: `cursor`. Commit: `aaaaaaa`.
- Result:

```json
{"commit":"aaaaaaa","machine":"cursor","unknown_deviations":[],"R0":{"score":"yes"},"R1":{"pass":61,"total":65,"first_fail":"parse-port: got [\"x.com:443\"], want [\"x.com\"]"},"R2":{"pass":11,"total":23,"first_fail":"subdomain: e2e.mjs does not mention \"a subdomain of a blocked site is blocked\" (www and a deeper subdomain of a listed site are blocked)"},"R3":{"score":"unmeasured","how":"SCORE_E2E=1 scripts/score (Chrome for Testing, xvfb when DISPLAY is unset; one run at a time, port 9333)"},"R4":{"pass":5,"total":8,"first_fail":"contrast-light-ink-soft: link and remaining time is 3.48:1, want at least 4.5:1","unmeasured":["options.html contrast: the page sets no background, and a headless load paints the body transparent, so contrast against the toolbar popup is not measured","options day toggles: options.js builds them and needs chrome.storage, so their hit size is not measured","blocked page link hit size: the link text is filled in at runtime","layout at 390px and 1280px, and Lighthouse: the pages are extension documents, and this meter does not score them"]},"R5":{"score":"manual","how":"the owner signs off on docs/screenshots and docs/demo-light.gif and docs/demo-dark.gif"}}
```

- R1 failures, from `scripts/score --all`: `parse-port` kept `x.com:443`, `parse-query` kept `news.ycombinator.com?p=1`, `parse-hash` kept `x.com#top`, `parse-userinfo` kept `user:pass@x.com`. The README says a pasted URL keeps only the domain.
- Command: `SCORE_E2E=1 scripts/score --no-gate`
- Browser: Chrome for Testing 158.0.8127.88, under `xvfb-run` because `DISPLAY` was unset. The run exited 0.
- R3 result: `{"pass":11,"total":23,"e2e":"pass","first_fail":"subdomain: e2e.mjs does not mention \"a subdomain of a blocked site is blocked\""}`
- R4 also fails `target-save` at 33.5px and `target-hours` at 31.5px. Those heights are the border box from the 13px font, the padding, and the border. A headless load of `options.html` in that same Chrome measured `#save` at 33.5 by 60.375 CSS pixels and `#startHour` at 31.5 by 70, which matches the meter. The options body background was `rgba(0, 0, 0, 0)`. `blocked.html` at 390 CSS pixels had `scrollWidth` 390. That layout pass is not a rung.
- Not measured, and not in a total: options contrast against the toolbar popup, the day-toggle hit size, the blocked-page link hit size, layout at two widths, and Lighthouse. R5 is manual. A fresh `scripts/score` leaves R3 unmeasured until `SCORE_E2E=1`.
