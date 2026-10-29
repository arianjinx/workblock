---
name: verify
description: "Verify Workblock before opening a PR. Use when a change needs install, test, or a browser check, or when asked to run verify. Workblock is an unpacked Manifest V3 extension with no build, no typecheck, and no lint."
---

# Verify Workblock

Run this before opening a PR. Stop at the first failure. Leave `npm run ship` alone. It merges.

There is one copy of this skill, at `.claude/skills/verify/SKILL.md`. Cursor loads `.claude/skills/`, and Claude Code loads a project skill of this name in place of its bundled `/verify`. Do not add a second copy under `.cursor/skills/`.

## Install

Nothing to install. `package.json` has no dependencies, and `.cursor/cloud-install.sh` exits 0. Skip `npm install`.

`npm run e2e` needs Node 22 or later. CI uses Node 24 (`.github/workflows/ci.yml`). The run that wrote this skill used Node v22.23.4.

No environment variables.

## Build

There is no build. The extension is plain ES modules loaded from this folder. `package.json` has no `build` script, and there is no bundler.

## Typecheck

There is no typecheck. `package.json` has no `typecheck` script, and the repo has no `tsconfig`.

## Lint

There is no lint. `package.json` has no `lint` script, and the repo has no linter config.

## Test

```sh
npm test
```

That is `node test.mjs && node prune.test.mjs`. There is no test runner and no filter. `test.mjs` stops at the first failure. To run one assert, comment the others out or run `node -e` against `schedule.js`.

No environment variables. `npm test` passed on the run that wrote this skill.

## Run

There is no dev server and no watch command. Load this folder unpacked:

1. Open `brave://extensions`, or `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked and select this folder.
4. After an edit, click reload on the Workblock card.

`options.html` is the toolbar popup and the options page (`manifest.json` sets both `action.default_popup` and `options_ui` to it). `blocked.html` is the page a blocked tab lands on.

## Check

The unit check is `npm test`.

The browser check is `npm run e2e`. It loads this folder with `--load-extension` into a throwaway profile, blocks `example.com`, and checks the blocked page. Pass a Chromium that still honors `--load-extension`:

```sh
npm run e2e -- "/path/to/Chromium"
```

With no argument, `cdp.mjs` launches macOS Brave at `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`. On Linux, pass a binary. Branded Chrome 137 and later ignores `--load-extension`. CI installs Chrome for Testing and runs `xvfb-run -a npm run e2e -- "$CHROME"` because the GitHub runner has no display. `CHROME` is a workflow variable. `e2e.mjs` reads the path from its argument, not from the environment.

On a machine with a display, `npm run e2e -- <chrome-for-testing>` is enough. That command passed on the Linux VM that wrote this skill, against Chrome for Testing stable, with Node v22.23.4. Branded Google Chrome on that VM was 156 and was left unused.

`e2e` and `demo` both listen on port 9333. Only one of them can run at a time. If something already answers on that port, stop that run. The script kills the browser it spawned and deletes its profile. If a run is interrupted, stop the process listening on 9333.

What `e2e` asserts, from `e2e.mjs`:

- A swept tab's blocked URL keeps the original link, and `blocked.html` renders that link.
- The visible tab returns when the block ends. A background tab waits until it is viewed.
- A legacy bare `blocked.html` steps back once the block is off.
- A new visit during a block lands on the blocked page.
- Overlapping storage writes leave one rule set, and the service worker threw nothing.

`npm run e2e` does not open the toolbar popup. The settings UI is the same `options.html`. Open it from the extension's options page. Expect the title `Workblock`, a Save button, hours 9 to 17, weekdays checked, and the default site list from `DEFAULTS` in `schedule.js`. The `#status` line follows the local clock: `Blocking now, until HH:00` inside the window, and `Off the clock. Nothing blocked.` outside it when sites and days are set. Opening that page inside the loaded extension passed on the same VM. The status read `Off the clock. Nothing blocked.` because the local hour was outside 9–17.

`npm run demo` rewrites `docs/demo-light.gif`, `docs/demo-dark.gif`, and `docs/screenshots/`. Run it only after a visible change to `options.html` or the blocked page. It needs `ffmpeg`, ImageMagick (`convert`), and network access. The VM that wrote this skill had `ffmpeg` and did not have `convert` or `magick`, so demo was not run.

If Chrome exits with `No usable sandbox!`, CI lifts Ubuntu's AppArmor restriction before e2e: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`. That was not required on the VM where e2e passed.

## Environment variables

| Command | Names it reads |
| --- | --- |
| `bash .cursor/cloud-install.sh` | none |
| `npm test` | none |
| `npm run e2e` | none. The browser path is an argument. |
| `npm run demo` | none |
| `npm run prune` | `GH_TOKEN`, `CLAUDE_CODE_REMOTE` |
| `npm run ship` | `GH_TOKEN`, `CLAUDE_CODE_REMOTE`, through the same `gh api` path as prune |

Verify does not run `prune` or `ship`. Do not print variable values.
