# AGENTS.md

Workblock is a Manifest V3 extension that blocks distracting sites during one weekly window. Many agents work on it at once, so every rule here keeps main green.

There is no build and no deploy workflow. The folder is the extension.

```sh
scripts/verify.sh
scripts/score
scripts/score --no-gate
SCORE_E2E=1 scripts/score
npm run ship
```

## Hill climb

- Follow LOOP.md. The score in GOAL.md is the only measure of progress, and FRONTIER.jsonl is the record.
- Own one folder. Never edit a folder another agent owns; ask the lead instead.
- Never silence a check or weaken a test to get green. Fix the code, not the check.
- Work in your own worktree. End every slice with `git pull --rebase && scripts/verify.sh && git push` to main.
- Keep slices small and push often. End every session with nothing unpushed.
- The commit message is the record: `type(scope): summary`, then why, with the commands and the numbers.
- Tests compare against the reference or real inputs. Don't add a test that only restates the code.
- No comments. Say it with a name. The gate fails on one.
- No plan, status or summary files, and no skills.
- One window of whole hours. `startHour` is inclusive, `endHour` is exclusive, and a window that wraps past midnight blocks nothing.
- `npm run prune` and `npm run ship` read `GH_TOKEN`. Never print it. Cloud agents do not run `ship`.
