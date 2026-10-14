// Removes the worktrees and branches whose tip a merged PR shipped: node prune.mjs
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// State: { main, here, worktrees: [{ path, branch, head }], inUse, local, remote, merged }
// where local and remote map branch to sha, and merged maps branch to merged PR head shas.
export function plan(s) {
	const mergedAtTip = (branch, sha) => branch !== "main" && (s.merged[branch] ?? []).includes(sha);
	const actions = [];
	const busy = new Set();
	for (const w of s.worktrees) {
		if (w.path === s.main) {
			if (w.branch) busy.add(w.branch);
			continue;
		}
		const why =
			w.path === s.here
				? "current worktree"
				: s.inUse.includes(w.path)
					? "in use"
					: !w.branch
						? "detached"
						: !mergedAtTip(w.branch, w.head)
							? "unmerged"
							: null;
		if (why) {
			if (w.branch) busy.add(w.branch);
			actions.push({ kind: "keep", what: w.path, why });
		} else actions.push({ kind: "remove-worktree", path: w.path });
	}
	for (const [branch, sha] of Object.entries(s.local)) {
		if (branch === "main" || busy.has(branch)) continue;
		if (mergedAtTip(branch, sha)) actions.push({ kind: "delete-local", branch });
		else actions.push({ kind: "keep", what: branch, why: "no merged PR at its tip" });
	}
	for (const [branch, sha] of Object.entries(s.remote)) {
		if (mergedAtTip(branch, sha)) actions.push({ kind: "delete-remote", branch });
	}
	return actions;
}

export const run = (cmd, opts = {}) => {
	const p = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", ...opts });
	return { ok: p.status === 0, out: (p.stdout ?? "").trim(), err: (p.stderr ?? p.error?.message ?? "").trim() };
};
export const git = (...args) => run(["git", ...args]);

export const repo = () => git("remote", "get-url", "origin").out.match(/[:/]([^/:]+\/[^/]+?)(\.git)?$/)?.[1] ?? "";
const proxyInjectsToken = process.env.CLAUDE_CODE_REMOTE === "true";
// REST only, because the cloud proxy rejects the GraphQL that `gh pr` uses.
export const ghApi = (...args) => {
	if (!process.env.GH_TOKEN && !proxyInjectsToken) {
		process.env.GH_TOKEN = run(["gh", "auth", "token", "--user", repo().split("/")[0]]).out;
	}
	return run(["gh", "api", ...args]);
};

// GitHub computes mergeability after a push, so a merge right after one can briefly refuse.
export function mergePr(number, sha) {
	for (let attempt = 1; ; attempt++) {
		const merge = ghApi("-X", "PUT", `repos/${repo()}/pulls/${number}/merge`, "-f", "merge_method=merge", "-f", `sha=${sha}`);
		if (merge.ok || attempt === 5 || !/HTTP 405/.test(merge.err)) return merge;
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
	}
}

export function syncMain() {
	git("fetch", "--quiet", "origin", "main");
	const mainTree = git("worktree", "list", "--porcelain")
		.out.split("\n\n")
		.find((block) => /^branch refs\/heads\/main$/m.test(block))
		?.match(/^worktree (.+)$/m)?.[1];
	return mainTree
		? git("-C", mainTree, "merge", "--ff-only", "--quiet", "origin/main")
		: git("fetch", "--quiet", "origin", "main:main");
}

const refs = (prefix) =>
	Object.fromEntries(
		git("for-each-ref", "--format=%(refname) %(objectname)", prefix)
			.out.split("\n")
			.filter(Boolean)
			.map((line) => line.slice(prefix.length).split(" "))
			.filter(([branch]) => branch !== "HEAD"),
	);

export function read() {
	git("fetch", "--prune", "--quiet", "origin");
	git("worktree", "prune");
	const pulls = ghApi(
		"--paginate",
		`repos/${repo()}/pulls?state=closed&base=main&per_page=100`,
		"--jq",
		'.[] | select(.merged_at) | "\\(.head.ref) \\(.head.sha)"',
	);
	if (!pulls.ok) {
		console.error(`prune: could not list merged PRs, nothing deleted: ${pulls.err}`);
		return null;
	}
	const merged = {};
	for (const [branch, sha] of pulls.out
		.split("\n")
		.filter(Boolean)
		.map((line) => line.split(" "))) {
		merged[branch] = [...(merged[branch] ?? []), sha];
	}
	const worktrees = git("worktree", "list", "--porcelain")
		.out.split("\n\n")
		.map((block) => ({
			path: block.match(/^worktree (.+)$/m)?.[1] ?? "",
			head: block.match(/^HEAD (\w+)$/m)?.[1] ?? "",
			branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null,
		}));
	// Without lsof every worktree counts as in use, so nothing is removed by mistake.
	const cwds = run(["lsof", "-a", "-d", "cwd", "-Fn"]);
	const inUse = worktrees
		.map((w) => w.path)
		.filter((path) => !cwds.ok || cwds.out.split("\n").some((line) => line === `n${path}` || line.startsWith(`n${path}/`)));
	return {
		main: dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir").out),
		here: git("rev-parse", "--show-toplevel").out,
		worktrees,
		inUse,
		local: refs("refs/heads/"),
		remote: refs("refs/remotes/origin/"),
		merged,
	};
}

export function prune() {
	const state = read();
	if (!state) return false;
	for (const action of plan(state)) {
		if (action.kind === "keep") {
			console.log(`prune: kept ${action.what} (${action.why})`);
			continue;
		}
		const [target, result] =
			action.kind === "remove-worktree"
				? [action.path, git("worktree", "remove", action.path)]
				: action.kind === "delete-local"
					? [action.branch, git("branch", "-D", action.branch)]
					: [action.branch, ghApi("-X", "DELETE", `repos/${repo()}/git/refs/heads/${action.branch}`)];
		if (result.ok) console.log(`prune: ${action.kind} ${target}`);
		else console.error(`prune: ${action.kind} ${target} failed, kept: ${result.err.split("\n")[0]}`);
	}
	git("fetch", "--prune", "--quiet", "origin");
	return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(prune() ? 0 : 1);
