import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const LINE = "//";
const BLOCK = "/*";
const DIRECTIVES = [
	"eslint-disable",
	"@ts-expect-error",
	"@ts-ignore",
	"@ts-nocheck",
	"<reference",
	"@jsx",
	"@astro",
];

const files = spawnSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8" })
	.stdout.split("\n")
	.filter((file) => file && existsSync(join(root, file)));

function stripStrings(line) {
	let out = "";
	let quote = "";
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quote) {
			if (c === "\\") i++;
			else if (c === quote) quote = "";
			continue;
		}
		if (c === '"' || c === "'" || c === "`") {
			quote = c;
			continue;
		}
		if (c === "\\") {
			i++;
			continue;
		}
		out += c;
	}
	return out;
}

function directive(line) {
	let body = line.trim();
	if (body.startsWith(LINE)) body = body.slice(LINE.length).trim();
	else if (body.startsWith(BLOCK)) body = body.slice(BLOCK.length).trim();
	else if (body.startsWith("*")) body = body.slice(1).trim();
	else return false;
	return DIRECTIVES.some((name) => body.startsWith(name));
}

function license(line) {
	return /SPDX-License-Identifier|\bCopyright\b|All rights reserved/.test(line);
}

function codeComment(line) {
	if (directive(line) || license(line)) return false;
	const trimmed = line.trim();
	if (trimmed.startsWith(LINE) || trimmed.startsWith(BLOCK)) return true;
	const bare = stripStrings(line);
	return bare.includes(LINE) || bare.includes(BLOCK) || bare.includes("*/") || bare.includes("<!--") || bare.includes("-->");
}

function shellComment(line, index) {
	const trimmed = line.trim();
	if (index === 0 && trimmed.startsWith("#!")) return false;
	if (trimmed.startsWith("#")) return true;
	return stripStrings(line).includes(" # ");
}

function kind(file, text) {
	if (/\.(mjs|js|html|css)$/.test(file)) return "code";
	if (
		file.endsWith(".sh") ||
		file.endsWith(".yml") ||
		file.endsWith(".yaml") ||
		file.endsWith(".toml") ||
		file === ".npmrc" ||
		text.startsWith("#!")
	) {
		return "shell";
	}
	return "";
}

const ALLOWED_MARKDOWN = new Set([
	"AGENTS.md",
	"README.md",
	"GOAL.md",
	"LOOP.md",
	"FRONTIER.md",
	"docs/DEVIATIONS.md",
]);
const BANNED_PATH = [
	[/^docs\/.*\.md$/, "no docs; the commit message is the record"],
	[/(^|\/)CLAUDE\.md$/, "no CLAUDE.md; AGENTS.md is the one instruction file"],
	[/(^|\/)SKILL\.md$/, "no skills; scripts/verify.sh is the gate"],
	[/^\.agents\/skills\//, "no skills; scripts/verify.sh is the gate"],
	[/^\.claude\/skills\//, "no skills; scripts/verify.sh is the gate"],
	[/^\.cursor\/skills\//, "no skills; scripts/verify.sh is the gate"],
	[/(^|\/)DESIGN\.md$/, "no DESIGN.md; the commit message is the record"],
];

const KEPT_TEST = new Set(["prune.test.mjs"]);
const UNIT_TEST = /(?:^|\/)test\.[cm]?[jt]sx?$|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_.+\.py$|_test\.py$/;

const broken = [];
for (const file of files) {
	if (UNIT_TEST.test(file) && !KEPT_TEST.has(file)) {
		broken.push(`${file}: a unit test; scripts/score checks schedule.js, and e2e.mjs checks the browser`);
	}
	for (const [pattern, why] of BANNED_PATH) {
		if (pattern.test(file) && !ALLOWED_MARKDOWN.has(file)) broken.push(`${file}: ${why}`);
	}
	if (file.endsWith(".md") && !ALLOWED_MARKDOWN.has(file)) broken.push(`${file}: no docs; the commit message is the record`);

	const path = join(root, file);
	if (!statSync(path).isFile()) continue;
	const text = readFileSync(path, "utf8");
	const mode = kind(file, text);
	if (!mode) continue;
	text.split("\n").forEach((line, index) => {
		const hit = mode === "shell" ? shellComment(line, index) : codeComment(line);
		if (hit) broken.push(`${file}:${index + 1}: comment; say it with a name`);
	});
}

const EXACT = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const SHA = /^[0-9a-f]{40}$/;

function exactDependencies() {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
		const group = pkg[field];
		if (!group || typeof group !== "object") continue;
		for (const [name, spec] of Object.entries(group)) {
			if (!EXACT.test(spec)) broken.push(`package.json: ${name} is ${JSON.stringify(spec)}, not an exact version`);
		}
	}
	if (Array.isArray(pkg.trustedDependencies) && pkg.trustedDependencies.length) {
		broken.push(`package.json: trustedDependencies lets ${pkg.trustedDependencies.join(", ")} run install scripts`);
	}
}

function installPolicy() {
	if (!existsSync(join(root, "package-lock.json"))) broken.push("package-lock.json: missing");
	const npmrcPath = join(root, ".npmrc");
	const npmrc = existsSync(npmrcPath) ? readFileSync(npmrcPath, "utf8") : "";
	if (!npmrc.split("\n").some((line) => line.trim() === "ignore-scripts=true")) {
		broken.push(".npmrc: ignore-scripts=true is required");
	}
	const verify = readFileSync(join(root, "scripts/verify.sh"), "utf8");
	if (!verify.includes("npm ci") || !verify.includes("--ignore-scripts")) {
		broken.push("scripts/verify.sh: install with npm ci --ignore-scripts");
	}
}

function actionPins() {
	const dir = join(root, ".github/workflows");
	if (!existsSync(dir)) return;
	for (const name of readdirSync(dir)) {
		if (!/\.ya?ml$/.test(name)) continue;
		const file = join(".github/workflows", name);
		readFileSync(join(root, file), "utf8").split("\n").forEach((line, index) => {
			const uses = line.match(/^\s*-?\s*uses:\s*(\S+)/)?.[1];
			if (!uses || uses.startsWith("./")) return;
			const ref = uses.split("@")[1] ?? "";
			if (!SHA.test(ref)) broken.push(`${file}:${index + 1}: ${uses} is not a commit SHA`);
		});
	}
}

function runnerPins() {
	for (const file of files) {
		if (!/\.(mjs|js|sh|ya?ml)$/.test(file) && file !== ".agents/setup" && file !== "package.json") continue;
		const text = readFileSync(join(root, file), "utf8");
		for (const match of text.matchAll(/\b(?:bunx|npx(?:\s+-y)?)\s+(?:--\S+\s+)*["']?([@\w./$-]+)/g)) {
			const name = match[1];
			const at = name.lastIndexOf("@");
			const version = at > 0 ? name.slice(at + 1) : "";
			if (version && EXACT.test(version)) continue;
			broken.push(`${file}: runs ${name}, which is not an exact version`);
		}
	}
}

exactDependencies();
installPolicy();
actionPins();
runnerPins();

if (broken.length) {
	console.log(broken.join("\n"));
	process.exit(1);
}
