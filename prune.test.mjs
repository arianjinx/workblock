// Self-check for the prune plan: node prune.test.mjs
import assert from "node:assert/strict";
import { plan } from "./prune.mjs";

const MAIN = "/repo";
const state = (o = {}) => ({
	main: MAIN,
	here: MAIN,
	worktrees: [{ path: MAIN, branch: "main", head: "m1" }],
	inUse: [],
	local: { main: "m1" },
	remote: { main: "m1" },
	merged: {},
	...o,
});

assert.deepEqual(
	plan(
		state({
			worktrees: [
				{ path: MAIN, branch: "main", head: "m1" },
				{ path: "/repo/.claude/worktrees/a", branch: "feat/a", head: "a1" },
			],
			local: { main: "m1", "feat/a": "a1" },
			remote: { main: "m1", "feat/a": "a1" },
			merged: { "feat/a": ["a0", "a1"] },
		}),
	),
	[
		{ kind: "remove-worktree", path: "/repo/.claude/worktrees/a" },
		{ kind: "delete-local", branch: "feat/a" },
		{ kind: "delete-remote", branch: "feat/a" },
	],
	"a merged branch goes from its worktree, local branch and remote",
);

assert.deepEqual(
	plan(
		state({
			worktrees: [
				{ path: MAIN, branch: "main", head: "m1" },
				{ path: "/repo/.claude/worktrees/a", branch: "feat/a", head: "a2" },
			],
			local: { main: "m1", "feat/a": "a2" },
			remote: { main: "m1", "feat/a": "a1" },
			merged: { "feat/a": ["a1"] },
		}),
	),
	[
		{ kind: "keep", what: "/repo/.claude/worktrees/a", why: "unmerged" },
		{ kind: "delete-remote", branch: "feat/a" },
	],
	"a commit after the merge keeps the branch",
);

assert.deepEqual(
	plan(
		state({
			here: "/repo/.claude/worktrees/a",
			worktrees: [
				{ path: MAIN, branch: "main", head: "m1" },
				{ path: "/repo/.claude/worktrees/a", branch: "feat/a", head: "a1" },
				{ path: "/repo/.claude/worktrees/b", branch: null, head: "b1" },
			],
			local: { main: "m1", "feat/a": "a1" },
			remote: { main: "m1" },
			merged: { "feat/a": ["a1"] },
		}),
	),
	[
		{ kind: "keep", what: "/repo/.claude/worktrees/a", why: "current worktree" },
		{ kind: "keep", what: "/repo/.claude/worktrees/b", why: "detached" },
	],
	"the current and detached worktrees stay, with the branch they hold",
);

assert.deepEqual(
	plan(
		state({
			worktrees: [
				{ path: MAIN, branch: "main", head: "m1" },
				{ path: "/repo/.claude/worktrees/a", branch: "feat/a", head: "a1" },
			],
			inUse: ["/repo/.claude/worktrees/a"],
			local: { main: "m1", "feat/a": "a1" },
			remote: { main: "m1" },
			merged: { "feat/a": ["a1"] },
		}),
	),
	[{ kind: "keep", what: "/repo/.claude/worktrees/a", why: "in use" }],
	"a merged worktree another session sits in stays, with its branch",
);

assert.deepEqual(
	plan(
		state({
			worktrees: [{ path: MAIN, branch: "feat/a", head: "a1" }],
			local: { main: "m1", "feat/a": "a1" },
			remote: { main: "m1", "feat/a": "a1" },
			merged: { "feat/a": ["a1"], main: ["m1"] },
		}),
	),
	[{ kind: "delete-remote", branch: "feat/a" }],
	"the main checkout's branch is never deleted",
);

assert.deepEqual(
	plan(state({ local: { main: "m1", spike: "s1" }, remote: { main: "m1", spike: "s1" } })),
	[{ kind: "keep", what: "spike", why: "no merged PR at its tip" }],
	"a branch with no merged PR at its tip is reported, never deleted",
);

console.log("ok - prune plan checks passed");
