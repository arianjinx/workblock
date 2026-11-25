# Cursor cloud

Cursor cloud runs the `install` command in `.cursor/environment.json`:
`bash .agents/setup`. The script is idempotent. It installs Node 22 or later
when that is missing, then xvfb, Chrome for Testing under
`~/.cache/workblock/browsers`, and ffmpeg plus the distro ImageMagick package.
There are no package dependencies and no lockfile, so it does not run
`npm install`. The default VM runs that install and the checks below, so the
environment file keeps `install` as its only field. There is no Dockerfile,
no `start`, and no `terminals`.

From the repo root:

```sh
bash .agents/setup
scripts/verify.sh
```

`scripts/verify.sh` is the verify command. It runs `scripts/rules.mjs`, then
`npm test`, which is `node prune.test.mjs`. `scripts/score` checks
`schedule.js`. There is no build. The other commands are in
[AGENTS.md](../AGENTS.md).

`npm test` reads no secrets. The browser check reads none either. With no
argument, `npm run e2e` launches macOS Brave, so on this VM pass Chrome for
Testing and run it under xvfb:

```sh
CHROME=$(npx -y @puppeteer/browsers@3.2.4 install chrome@stable --path ~/.cache/workblock/browsers --format '{{path}}' | tail -n1)
xvfb-run -a npm run e2e -- "$CHROME"
```

`npm run prune` and `npm run ship` read `GH_TOKEN`. When `CLAUDE_CODE_REMOTE`
is `true`, a proxy supplies that token. Cloud agents do not run `ship`.

A Build snapshot keeps disk state only. Setup clears
`kernel.apparmor_restrict_unprivileged_userns` when sudo allows it. If a later
boot still makes Chrome exit with `No usable sandbox!`, set that sysctl again.
The distro `imagemagick` package provides `convert` and not `magick`, so
`npm run demo` still needs ImageMagick 7.
