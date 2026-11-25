# LOOP: one hill-climb iteration

Repeat until every rung in GOAL.md is at its frontier.

1. **Measure.** `git pull --rebase`, then `scripts/score --all > /tmp/score.json`. Compare it with the last lines of FRONTIER.jsonl. `--all` lists every failing check, not only the first. `scripts/score --no-gate` skips R0 when the gate already passed.
2. **Pick the lowest rung below its frontier that your files can move.** Work on the `first_fail` the score names. Skip anything FRONTIER.jsonl already rejected, unless you have a new reason. An unmeasured rung is not at its frontier.
3. **Find the cause, not the symptom.** For R1, run that input through `schedule.js` and read the README sentence it comes from. For R2 and R3, read the promise in `scripts/score.mjs` and the file that should make it true. For R4, read the token or the rule the check names. Do not guess.
4. **Prove it with a check that fails before and passes after.**
   - R1: change `schedule.js` until the vector in `scripts/score.mjs` passes. Do not add a unit test, and do not change what a vector expects. A wrong expectation is a question for the owner, and then an entry in `docs/DEVIATIONS.md`.
   - R2: an assertion in `e2e.mjs` whose message contains the flow's phrase. Adding the phrase without the behavior is cheating the score.
   - R3: `SCORE_E2E=1 scripts/score` goes up, and no other rung goes down.
   - R4: the failing check passes. Contrast is at least 4.5:1. The Save button and the hour fields are at least 44px tall.
5. **Gate.** `scripts/verify.sh` passes. Never silence a check or weaken a test: change the code until it passes.
6. **Prove it went up.** Score again. If any rung went down, revert.
7. **Record and push.** Append one line to FRONTIER.jsonl and update the table in FRONTIER.md. Commit with `type(scope): summary`. Name the rung, the old score, the new score, and the cause. Then `git pull --rebase && scripts/verify.sh && git push`.

Do not run `npm run ship`. A person merges.

Log a rejected attempt too, with `"accepted": false` and the numbers, so no one retries it.

## Files

Give each agent one group, and never two agents one group. The repo is flat, so a group is a set of files.

| Files | Rungs it moves |
|---|---|
| `schedule.js` | R1 |
| `background.js` | the block, the badge, the purge, cookies, subdomains, a site that is not listed |
| `blocked.html`, `blocked.js` | the blocked page, and R4 contrast |
| `options.html`, `options.js` | the popup, and R4 tap targets |
| `e2e.mjs`, `cdp.mjs` | R2 and R3. This group adds the flow. It asks the owner of a file before changing behavior there. |

`scripts/score.mjs` is the meter. Nobody edits an expected value or a flow phrase to make a score go up. Everyone may append `FRONTIER.md` and `FRONTIER.jsonl`. On a conflict in `FRONTIER.jsonl`, keep both sides. `.gitattributes` marks that file `merge=union`.

## Working beside other agents

- Own one group. Never edit a group another agent owns. Ask the lead instead.
- Work in your own git worktree. Rebase before every push. On a conflict in someone else's change, keep theirs and redo yours on top.
- Keep slices small and push often. Unpushed work is lost when an agent dies.
- Run `SCORE_E2E=1` one at a time. `e2e.mjs` and `demo.mjs` both listen on port 9333.
- The browser check needs Chrome for Testing, which `.agents/setup` installs. Branded Chrome 137 and later ignores `--load-extension`.
- End every session with nothing unpushed.
