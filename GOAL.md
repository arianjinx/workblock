# Goal: every blocking promise in the README and AGENTS.md is proven by a check, and the popup and blocked page meet the contrast and tap-target rules

Workblock climbs a ladder. Each rung has a number that only goes up, printed by `scripts/score`. A rung counts only when `scripts/verify.sh` passes on the same commit. The reference is this repo's own spec: the README and AGENTS.md already say what a block does, and Chrome for Testing already runs the end-to-end script in CI.

| Rung | Name | Score (higher is better) | Frontier |
|---|---|---|---|
| R0 | Gate | `scripts/verify.sh` passes. That is `npm test`: `node test.mjs` and `node prune.test.mjs` | yes |
| R1 | Schedule | spec checks on `schedule.js`, and the README permissions table against `manifest.json`, that come out as the spec says | every check |
| R2 | Flows | browser promises whose phrase appears in `e2e.mjs` | every promise |
| R3 | Device | those promises that pass under Chrome for Testing. Run with `SCORE_E2E=1 scripts/score` | every promise |
| R4 | UI rules | blocked-page color pairs at 4.5:1 or better, in light and dark, and the Save button and the hour fields at least 44px tall | every check |
| R5 | Taste | the owner signs off on `docs/screenshots/` and `docs/demo-light.gif` and `docs/demo-dark.gif` | the owner's yes |

Climb in order: R0, R1, R2, R3, R4, then R5. A rung above an unmet one does not count. R3 is unmeasured until `SCORE_E2E=1`, and an unmeasured rung is not at its frontier. R5 is a person. Agents stop there and hand the screenshots over.

There is no speed rung. The one-minute alarm is a limit the README states, not a number to chase.

## Why each frontier can be reached

- **R1.** `schedule.js` imports no browser APIs, so each check is an input and the answer the README already gives. A pasted URL is supposed to keep only the domain. A port, a query with no slash, a hash with no slash, and a user name still ride along in the string `parseSites` keeps. The permissions table already names every permission in `manifest.json`.
- **R2 and R3.** `e2e.mjs` already walks the promises it names: a swept tab, the return, a background tab, a legacy page, a new visit, capitals, and overlapping writes. CI runs that script on Chrome for Testing. Each missing promise is the same kind of check.
- **R4.** The blocked page stores its colors as hex tokens. The light link and the remaining time use `--ink-soft` on `--paper`, and that pair is under 4.5:1. The other five pairs already clear it. The Save button and the hour fields are short because the body font is 13px and the padding is 7px and 5px. 4.5:1 is WCAG 2.2 AA for text this size. 44px is the tap-target rule on the UI ladder (WCAG 2.5.5).
- **R5.** `npm run demo` already records the GIFs and the screenshots. A person looks at them.

## How each rung is measured

- **R0.** `scripts/verify.sh` runs `npm test` and prints `verify: green`. It adds no checks of its own.
- **R1.** `scripts/score` calls `schedule.js`. `first_fail` names the first check that disagrees. `--all` lists every failure. `--no-gate` skips R0.
- **R2.** Each promise in `scripts/score.mjs` has a phrase. It counts when `e2e.mjs` contains that phrase. Adding the phrase without the behavior is cheating the score.
- **R3.** `SCORE_E2E=1 scripts/score` runs `npm run e2e`. With no `DISPLAY`, it runs under `xvfb-run`. The browser is `SCORE_CHROME`, or Chrome for Testing under `~/.cache/workblock/browsers`. One run at a time: `e2e.mjs` and `demo.mjs` both use port 9333. Without the flag the rung is `unmeasured`.
- **R4.** Contrast is computed from the `:root` tokens in `blocked.html`, light and dark, for the ticket text, the link and the remaining time, and the note. The Save and hour heights are computed from the font, padding, and border in `options.html`. A check the meter cannot make is listed under `unmeasured` and is not in the total.
- **R5.** Always `manual`.

A bold id in `docs/DEVIATIONS.md` leaves that check or flow out of the total. Only the owner adds an entry.

## Sources of truth

In order of trust:

1. The README and AGENTS.md. When the code and a sentence there disagree, the sentence wins, unless the owner changes the sentence or writes a deviation.
2. What this folder does in Chrome for Testing.
3. The code: `schedule.js`, then `background.js`, `blocked.js`, `options.js`.

Read them to see what to prove. Do not copy another extension's code.

## Out of scope

- A window that wraps past midnight, a split day, or a start that is not a whole hour. The product refuses those. A wrapping window blocks nothing, and that refusal is an R1 check, not a feature to add.
- Stopping a person who disables the extension or unticks today.
- Safari, phones, and DNS blocking.
- The Chrome Web Store, `npm run ship`, and anything that deploys.
- Shortening the one-minute alarm.
- Lighthouse. The pages are extension documents, not a public site.
