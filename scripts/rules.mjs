import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
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
	if (file.endsWith(".sh") || text.startsWith("#!")) return "shell";
	return "";
}

const ALLOWED_MARKDOWN = new Set([
	"AGENTS.md",
	"README.md",
	"GOAL.md",
	"LOOP.md",
	"FRONTIER.md",
	"docs/DEVIATIONS.md",
	"docs/cursor-cloud.md",
]);
const BANNED_PATH = [
	[/^docs\/.*\.md$/, "no docs; the commit message is the record"],
	[/(^|\/)CLAUDE\.md$/, "no CLAUDE.md; AGENTS.md is the one instruction file"],
	[/(^|\/)SKILL\.md$/, "no skills; scripts/verify.sh is the gate"],
	[/^\.agents\/skills\//, "no skills; scripts/verify.sh is the gate"],
	[/^\.claude\/skills$/, "no skills; scripts/verify.sh is the gate"],
	[/^\.cursor\/skills\//, "no skills; scripts/verify.sh is the gate"],
	[/(^|\/)DESIGN\.md$/, "no DESIGN.md; the commit message is the record"],
];

const broken = [];
for (const file of files) {
	for (const [pattern, why] of BANNED_PATH) {
		if (pattern.test(file) && !ALLOWED_MARKDOWN.has(file)) broken.push(`${file}: ${why}`);
	}
	if (file.endsWith(".md") && !ALLOWED_MARKDOWN.has(file)) broken.push(`${file}: no docs; the commit message is the record`);

	if (file.startsWith(".github/")) continue;
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

if (broken.length) {
	console.log(broken.join("\n"));
	process.exit(1);
}
