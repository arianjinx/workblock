// Merges the current branch to main through a PR, then prunes: node ship.mjs
import { spawnSync } from "node:child_process";
import { ghApi, git, mergePr, prune, repo, syncMain } from "./prune.mjs";

const fail = (why) => {
	console.error(`ship: ${why}`);
	process.exit(1);
};

const branch = git("rev-parse", "--abbrev-ref", "HEAD").out;
if (branch === "HEAD") fail("HEAD is detached, check out a branch first");
if (branch === "main") fail("already on main, ship from a branch");
if (git("status", "--porcelain").out) fail("the working tree has uncommitted changes, commit them first");

const [owner] = repo().split("/");
const pulls = (state) =>
	ghApi(
		`repos/${repo()}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&base=main&state=${state}`,
		"--jq",
		'.[] | "\\(.number) \\(.head.sha) \\(.merged_at)"',
	);
const tip = git("rev-parse", "HEAD").out;
const shipped = pulls("closed")
	.out.split("\n")
	.some((line) => line.split(" ")[1] === tip && !line.endsWith(" null"));

if (!shipped) {
	if (!git("fetch", "--quiet", "origin", "main").ok) fail("could not fetch origin/main");
	if (!git("merge-base", "--is-ancestor", "origin/main", "HEAD").ok) {
		const merge = git("merge", "--no-edit", "origin/main");
		if (!merge.ok) {
			git("merge", "--abort");
			fail(`origin/main does not merge cleanly, resolve it by hand:\n${merge.out}`);
		}
	}

	if (spawnSync("npm", ["test"], { stdio: "inherit" }).status !== 0) fail("npm test failed, fix it and run ship again");

	if (spawnSync("git", ["push", "--quiet", "-u", "origin", "HEAD"], { stdio: "inherit" }).status !== 0) fail("push failed");

	const head = git("rev-parse", "HEAD").out;
	let number = pulls("open").out.split(" ")[0];
	if (!number) {
		const title = git("log", "--reverse", "--no-merges", "--format=%s", "origin/main..HEAD").out.split("\n")[0];
		if (!title) fail("no commits of its own to ship, origin/main already has them");
		const body = git("log", "--reverse", "--no-merges", "--format=- %s", "origin/main..HEAD").out;
		const create = ghApi(
			"-X",
			"POST",
			`repos/${repo()}/pulls`,
			"-f",
			`title=${title}`,
			"-f",
			`head=${branch}`,
			"-f",
			"base=main",
			"-f",
			`body=${body}`,
			"--jq",
			".number",
		);
		if (!create.ok) fail(`could not open a PR: ${create.err}`);
		number = create.out;
		console.log(`ship: opened https://github.com/${repo()}/pull/${number}`);
	}

	const merge = mergePr(number, head);
	if (!merge.ok) fail(`could not merge https://github.com/${repo()}/pull/${number}: ${merge.err}`);
	console.log(`ship: merged https://github.com/${repo()}/pull/${number}`);
}

const sync = syncMain();
if (!sync.ok) console.error(`ship: local main did not fast-forward, kept as is: ${sync.err.split("\n")[0]}`);

prune();
