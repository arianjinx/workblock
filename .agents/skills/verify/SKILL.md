---
name: verify
description: "Verify Workblock before opening a PR. Use when a change needs install, test, or a browser check, or when asked to run verify. Workblock is an unpacked Manifest V3 extension with no build, no typecheck, and no lint."
---

# Verify Workblock

Run this before opening a PR. Stop at the first failure. Leave `npm run ship` alone. It merges.

There is one copy of this skill, at `.agents/skills/verify/SKILL.md`. Amp and Cursor load `.agents/skills/`. Claude Code loads it through the `.claude/skills` symlink, as a project skill that replaces its bundled `/verify`. Do not add a second copy under `.cursor/skills/` or a real `.claude/skills/` folder.

## Install

`package.json` has no dependencies, so skip `npm install`. `.agents/setup` installs what the checks below drive: Node 22 or later, xvfb, and Chrome for Testing, the way CI does. Amp runs it for each orb, `.cursor/environment.json` runs it as the Cursor cloud install, and the SessionStart hook runs it in Claude Code cloud. It is idempotent. Run it yourself when `xvfb-run` or the Chrome below is missing:

```sh
bash .agents/setup
```

The same command CI uses prints the Chrome path, and downloads nothing when that Chrome is already installed:

```sh
CHROME=$(npx -y @puppeteer/browsers@3.2.4 install chrome@stable --path ~/.cache/workblock/browsers --format '{{path}}' | tail -n1)
```

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

In a cloud machine after `.agents/setup`, with `CHROME` set as in Install, run `xvfb-run -a npm run e2e -- "$CHROME"`. On a machine with a display, `npm run e2e -- <chrome-for-testing>` is enough. That command passed on the Linux VM that wrote this skill, against Chrome for Testing stable, with Node v22.23.4. Branded Google Chrome on that VM was 156 and was left unused.

`e2e` and `demo` both listen on port 9333. Only one of them can run at a time. If something already answers on that port, stop that run. The script kills the browser it spawned and deletes its profile. If a run is interrupted, stop the process listening on 9333.

What `e2e` asserts, from `e2e.mjs`:

- A swept tab's blocked URL keeps the original link, and `blocked.html` renders that link.
- The visible tab returns when the block ends. A background tab waits until it is viewed.
- A legacy bare `blocked.html` steps back once the block is off.
- A new visit during a block lands on the blocked page.
- A site stored with capitals (`Example.com`) still blocks.
- Overlapping storage writes leave one rule set, and the service worker threw nothing.

`npm run e2e` does not open the toolbar popup. The settings UI is the same `options.html`. Open it from the extension's options page. Expect the title `Workblock`, a Save button, hours 9 to 17, weekdays checked, and the default site list from `DEFAULTS` in `schedule.js`. The `#status` line follows the local clock: `Blocking now, until HH:00` inside the window, and `Off the clock. Nothing blocked.` outside it when sites and days are set. Opening that page inside the loaded extension passed on the same VM. The status read `Off the clock. Nothing blocked.` because the local hour was outside 9–17. Save writes the list back normalised: a line like `https://www.x.com/foo` becomes `x.com`, and `#` lines and blanks are dropped. Names are lowercased on save, so `Reddit.com` is saved as `reddit.com`. `buildRules` and `hostMatches` lowercase sites when they match, so a list saved with capitals by an older version still blocks.

`npm run demo` rewrites `docs/demo-light.gif`, `docs/demo-dark.gif`, and `docs/screenshots/`. Run it only after a visible change to `options.html` or the blocked page, and commit the regenerated files. It needs `ffmpeg`, ImageMagick's `magick` command (`demo.mjs` calls `magick`, not `convert`), and network access to news.ycombinator.com and youtube.com. `.agents/setup` installs `ffmpeg` and the distro `imagemagick` package, which has `magick` only where the distro ships ImageMagick 7, and warns when it does not. It takes the browser path as an argument, the same way `e2e` does, so in a cloud machine run `xvfb-run -a npm run demo -- "$CHROME"`. That took about 14 seconds and rewrote all seven files. Demo leaves its frames in `/tmp/workblock-demo-*`, so delete that folder. To throw the rewrite away, run `git checkout docs`.

If Chrome exits with `No usable sandbox!`, CI lifts Ubuntu's AppArmor restriction before e2e: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`. That was not required on the VM where e2e passed.

## Environment variables

| Command | Names it reads |
| --- | --- |
| `bash .agents/setup` | `HOME` |
| `npm test` | none |
| `npm run e2e` | none. The browser path is an argument. |
| `npm run demo` | none |
| `npm run prune` | `GH_TOKEN`, `CLAUDE_CODE_REMOTE` |
| `npm run ship` | `GH_TOKEN`, `CLAUDE_CODE_REMOTE`, through the same `gh api` path as prune |

Verify does not run `prune` or `ship`. Do not print variable values.
