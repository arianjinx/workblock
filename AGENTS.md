# AGENTS.md

Workblock is a Manifest V3 extension that blocks distracting sites during one weekly window. Many agents work on it at once, so every rule here keeps main green.

```sh
scripts/verify.sh          # the gate: scripts/rules.mjs, then npm test
scripts/score              # every rung of GOAL.md, one JSON object
scripts/score --no-gate    # the same, without the gate
SCORE_E2E=1 scripts/score  # R3, Chrome for Testing, one at a time, port 9333
```

## Work

- Follow LOOP.md toward GOAL.md. The score is the only measure of progress, and FRONTIER.jsonl is the record.
- Own one file group from LOOP.md. Never edit a group another agent owns.
- Work in your own worktree. End every slice with `git pull --rebase && scripts/verify.sh && git push`.
- A person merges. Do not run `npm run ship`, and do not push to main.
- Small slices, pushed often. End every session with nothing unpushed.

## Record

- The commit message is the record: `type(scope): summary`, then why, with the commands and the numbers. A commit that moves a rung ends with `Score: R1 61/65 -> 65/65`.
- A rejected attempt is a line in FRONTIER.jsonl with `"accepted": false`, so no one retries it.
- No plan, status or summary files, and no skills.

## Code

- No comments. Say it with a name. The gate fails on one.
- No new unit test that restates `schedule.js`. `scripts/score` is that check. `prune.test.mjs` stays, because it is the only check of `prune.mjs`. `e2e.mjs` stays, because it is the browser check.
- One window of whole hours. `startHour` is inclusive, `endHour` is exclusive, and a window that wraps past midnight blocks nothing. Do not add one.
- A new dependency says in its commit what it replaces and why this repo will not write it. There are none today.

## Secrets

`npm run prune` and `npm run ship` read `GH_TOKEN`. Never print it. Cloud agents do not run `ship`.
