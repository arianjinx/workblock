import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import {
	DEFAULTS,
	blockedPageUrl,
	buildRules,
	hostMatches,
	isValidWindow,
	isWorkHours,
	parseSites,
	webReturnUrl,
} from "../schedule.js";

const root = join(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const on = (name) => process.env[name] === "1";

const at = (day, hour, minute = 0) => new Date(2026, 6, 26 + day, hour, minute);
const sundayOnly = { startHour: 9, endHour: 17, days: [0] };
const wrap = { startHour: 22, endHour: 2, days: [0, 1, 2, 3, 4, 5, 6] };

function deviations() {
	const file = join(root, "docs/DEVIATIONS.md");
	if (!existsSync(file)) return new Set();
	const ids = new Set();
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const match = line.match(/^- \*\*([^*]+)\*\*/);
		if (match) ids.add(match[1].trim());
	}
	return ids;
}

function keep(checks, dropped) {
	return checks.filter((check) => !dropped.has(check.id));
}

function summarize(checks, extra = {}) {
	const live = checks;
	const fails = live.filter((check) => !check.pass);
	const body = {
		pass: live.length - fails.length,
		total: live.length,
		first_fail: fails[0]?.detail ?? "",
		...extra,
	};
	if (args.has("--all")) body.fails = fails.map((check) => check.detail);
	return body;
}

function eq(checks, id, got, want) {
	const pass = JSON.stringify(got) === JSON.stringify(want);
	checks.push({
		id,
		pass,
		detail: pass ? "" : `${id}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
	});
}

function scheduleChecks() {
	const checks = [];
	eq(checks, "wed-start", isWorkHours(DEFAULTS, at(3, 9, 0)), true);
	eq(checks, "wed-0930", isWorkHours(DEFAULTS, at(3, 9, 30)), true);
	eq(checks, "wed-1659", isWorkHours(DEFAULTS, at(3, 16, 59)), true);
	eq(checks, "wed-end", isWorkHours(DEFAULTS, at(3, 17, 0)), false);
	eq(checks, "wed-1730", isWorkHours(DEFAULTS, at(3, 17, 30)), false);
	eq(checks, "wed-before", isWorkHours(DEFAULTS, at(3, 8, 30)), false);
	eq(checks, "wed-midnight", isWorkHours(DEFAULTS, at(3, 0, 0)), false);
	eq(checks, "saturday", isWorkHours(DEFAULTS, at(6, 10, 30)), false);
	eq(checks, "sunday", isWorkHours(DEFAULTS, at(0, 10, 30)), false);
	eq(checks, "monday", isWorkHours(DEFAULTS, at(1, 10, 30)), true);
	eq(checks, "friday", isWorkHours(DEFAULTS, at(5, 10, 30)), true);
	eq(checks, "default-window", isValidWindow(DEFAULTS), true);
	eq(checks, "wrap-rejected", isValidWindow({ startHour: 22, endHour: 2 }), false);
	eq(checks, "empty-window", isValidWindow({ startHour: 9, endHour: 9 }), false);
	eq(checks, "end-before-start", isValidWindow({ startHour: 17, endHour: 9 }), false);
	eq(checks, "wrap-hour-23", isWorkHours(wrap, at(3, 23)), false);
	eq(checks, "wrap-hour-1", isWorkHours(wrap, at(3, 1)), false);
	eq(checks, "sunday-only", isWorkHours(sundayOnly, at(0, 10)), true);
	eq(checks, "sunday-not-monday", isWorkHours(sundayOnly, at(1, 10)), false);
	eq(checks, "no-days", isWorkHours({ startHour: 9, endHour: 17, days: [] }, at(3, 10)), false);

	const list = ["youtube.com", "x.com"];
	eq(checks, "host-www", hostMatches("https://www.youtube.com/watch?v=abc", list), true);
	eq(checks, "host-bare", hostMatches("https://youtube.com/", list), true);
	eq(checks, "host-suffix", hostMatches("https://notyoutube.com/", list), false);
	eq(checks, "host-evil", hostMatches("https://youtube.com.evil.test/", list), false);
	eq(checks, "host-extension", hostMatches("chrome-extension://abc/blocked.html", list), false);
	eq(checks, "host-blank", hostMatches("about:blank", list), false);
	eq(checks, "host-capitals", hostMatches("https://www.example.com/", ["Example.com"]), true);
	eq(checks, "host-empty", hostMatches("", list), false);
	eq(checks, "host-mobile", hostMatches("https://mobile.x.com/home", ["x.com"]), true);
	eq(checks, "host-nested", hostMatches("https://a.b.x.com/", ["x.com"]), true);
	eq(checks, "host-other", hostMatches("https://example.org/", list), false);
	eq(checks, "host-http", hostMatches("http://x.com/a", list), true);

	eq(checks, "rules-main-frame", buildRules(["x.com"])[0].condition.resourceTypes, ["main_frame"]);
	eq(checks, "rules-lower", buildRules(["Example.com"])[0].condition.requestDomains, ["example.com"]);
	eq(checks, "rules-no-www", buildRules(["x.com"])[0].condition.requestDomains, ["x.com"]);
	eq(checks, "rules-ids", buildRules(["x.com", "reddit.com"]).map((rule) => rule.id), [1, 2]);
	eq(checks, "rules-block", buildRules(["x.com"])[0].action, { type: "block" });
	eq(checks, "rules-empty", buildRules([]), []);

	eq(
		checks,
		"parse-example",
		parseSites("https://www.x.com/home\n\n# a comment\n  reddit.com  \n"),
		["x.com", "reddit.com"],
	);
	eq(checks, "parse-case", parseSites("HTTPS://WWW.Example.COM/Path\nReddit.com"), ["example.com", "reddit.com"]);
	eq(checks, "parse-empty", parseSites(""), []);
	eq(checks, "parse-foo", parseSites("https://www.x.com/foo"), ["x.com"]);
	eq(checks, "parse-www", parseSites("www.x.com"), ["x.com"]);
	eq(checks, "parse-mobile-kept", parseSites("https://mobile.x.com/i"), ["mobile.x.com"]);
	eq(checks, "parse-port", parseSites("https://x.com:443/home"), ["x.com"]);
	eq(checks, "parse-query", parseSites("https://news.ycombinator.com?p=1"), ["news.ycombinator.com"]);
	eq(checks, "parse-hash", parseSites("https://x.com#top"), ["x.com"]);
	eq(checks, "parse-userinfo", parseSites("https://user:pass@x.com/home"), ["x.com"]);

	const original = "https://www.youtube.com/watch?v=abc&t=42s#comments";
	const page = blockedPageUrl("chrome-extension://id/blocked.html", original);
	eq(checks, "return-roundtrip", webReturnUrl(new URL(page).search), original);
	eq(checks, "return-http", webReturnUrl("?url=http%3A%2F%2Fx.com%2Fa"), "http://x.com/a");
	eq(checks, "return-bare", webReturnUrl(""), null);
	eq(checks, "return-javascript", webReturnUrl("?url=javascript%3Aalert(1)"), null);
	eq(checks, "return-javascript-mixed", webReturnUrl("?url=JavaScript%3Aalert(1)"), null);
	eq(checks, "return-extension", webReturnUrl("?url=chrome-extension%3A%2F%2Fid%2Fblocked.html"), null);
	eq(checks, "return-data", webReturnUrl("?url=data%3Atext%2Fhtml%2Chi"), null);
	return checks;
}

function permissionChecks() {
	const checks = [];
	const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")).permissions;
	const readme = readFileSync(join(root, "README.md"), "utf8");
	const section = readme.split("### Why each permission")[1]?.split(/\n## /)[0] ?? "";
	const listed = [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
	for (const perm of manifest) {
		const id = `perm-${perm}`;
		const pass = listed.includes(perm);
		checks.push({ id, pass, detail: pass ? "" : `${id}: manifest permission has no README row` });
	}
	for (const perm of listed) {
		const id = `readme-${perm}`;
		const pass = manifest.includes(perm);
		checks.push({ id, pass, detail: pass ? "" : `${id}: README permission is not in manifest.json` });
	}
	return checks;
}

const flows = [
	{
		id: "sweep-keeps-url",
		promise: "A swept tab keeps the original link",
		needle: "blocked tab keeps the original URL",
		done: "ok - swept tab returns once unblocked",
	},
	{
		id: "link-renders",
		promise: "The blocked page renders that link",
		needle: "link to render",
		done: "ok - swept tab returns once unblocked",
	},
	{
		id: "sweep-returns",
		promise: "The visible tab goes back when the block ends",
		needle: "tab to return once unblocked",
		done: "ok - swept tab returns once unblocked",
	},
	{
		id: "saved-group",
		promise: "Reopening a saved blocked tab goes back to the link",
		needle: "reopened blocked tab to return",
		done: "ok - blocked tab reopened from a saved group returns",
	},
	{
		id: "background-waits",
		promise: "A background tab waits until it is viewed",
		needle: "background tab waits until it is viewed",
		done: "ok - background tab returns when viewed, not before",
	},
	{
		id: "background-returns",
		promise: "A background tab goes back when it is viewed",
		needle: "background tab to return when viewed",
		done: "ok - background tab returns when viewed, not before",
	},
	{
		id: "legacy",
		promise: "A bare blocked.html steps back once the block is off",
		needle: "bare blocked tab to step back",
		done: "ok - tab swept by the old version steps back once off the clock",
	},
	{
		id: "new-visit",
		promise: "A new visit lands on the blocked page",
		needle: "lands on the blocked page",
		done: "ok - a new visit during a block lands on the blocked page, not the browser error",
	},
	{
		id: "capitals",
		promise: "A site saved with capitals still blocks",
		needle: "a site saved with capitals still blocks",
		done: "ok - a site saved with capitals still blocks",
	},
	{
		id: "overlap",
		promise: "Overlapping storage writes leave one rule set",
		needle: "overlapping syncs",
		done: "ok - overlapping syncs leave one consistent rule set and no errors",
	},
	{
		id: "quiet-worker",
		promise: "The service worker throws nothing during the run",
		needle: "background script threw nothing",
		done: "ok - overlapping syncs leave one consistent rule set and no errors",
	},
	{
		id: "subdomain",
		promise: "www and a deeper subdomain of a listed site are blocked",
		needle: "a subdomain of a blocked site is blocked",
	},
	{
		id: "names-the-block",
		promise: "The blocked page names the site and the time the block ends",
		needle: "the blocked page names the site and the time the block ends",
	},
	{
		id: "unlisted-site",
		promise: "A site that is not listed still loads during a block",
		needle: "a site that is not listed still loads",
	},
	{
		id: "embed",
		promise: "An embedded frame of a blocked site still loads",
		needle: "an embedded frame of a blocked site still loads",
	},
	{
		id: "purge-order",
		promise: "Open tabs are swept before service workers and cache storage are removed",
		needle: "the sweep runs before service workers are removed",
	},
	{
		id: "cookies",
		promise: "Cookies on a blocked site stay",
		needle: "cookies on a blocked site stay",
	},
	{
		id: "badge",
		promise: "The toolbar badge reads ON while a block is active",
		needle: "the badge reads ON",
	},
	{
		id: "popup-save",
		promise: "Save keeps only the domain and drops comments and blank lines",
		needle: "save keeps only the domain",
	},
	{
		id: "popup-window",
		promise: "The popup refuses an end hour that is not after the start",
		needle: "refuses an end hour that is not after the start",
	},
	{
		id: "status-off",
		promise: "Off the clock, the status says nothing is blocked",
		needle: "Off the clock. Nothing blocked.",
	},
	{
		id: "status-on",
		promise: "During the window, the status names the hour the block ends",
		needle: "Blocking now, until",
	},
	{
		id: "status-inactive",
		promise: "With no sites or no days, the status says to add them",
		needle: "Inactive: add sites and days.",
	},
];

function flowChecks(source) {
	return flows.map((flow) => {
		const pass = source.includes(flow.needle);
		return {
			id: flow.id,
			pass,
			detail: pass ? "" : `${flow.id}: e2e.mjs does not mention "${flow.needle}" (${flow.promise})`,
		};
	});
}

function findChrome(dir) {
	if (!existsSync(dir)) return "";
	const found = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(findChrome(path));
		else if (entry.name === "chrome") found.push(path);
	}
	return found.filter(Boolean).sort().at(-1) ?? "";
}

function device(source, dropped) {
	const how = "SCORE_E2E=1 scripts/score (Chrome for Testing, xvfb when DISPLAY is unset; one run at a time, port 9333)";
	if (!on("SCORE_E2E")) return { score: "unmeasured", how, first_fail: "" };
	const chrome = process.env.SCORE_CHROME || findChrome(join(homedir(), ".cache/workblock/browsers"));
	if (!chrome) return { score: "unmeasured", how: `${how}. Chrome for Testing was not under ~/.cache/workblock/browsers`, first_fail: "" };
	const xvfb = !process.env.DISPLAY;
	const run = xvfb
		? spawnSync("xvfb-run", ["-a", "npm", "run", "e2e", "--", chrome], { cwd: root, encoding: "utf8", timeout: 180000 })
		: spawnSync("npm", ["run", "e2e", "--", chrome], { cwd: root, encoding: "utf8", timeout: 180000 });
	if (run.error) return { score: "error", first_fail: run.error.message, how };
	const text = `${run.stdout}\n${run.stderr}`;
	const exitOk = run.status === 0;
	const live = flows.filter((flow) => !dropped.has(flow.id));
	let pass = 0;
	const fails = [];
	for (const flow of live) {
		const covered = source.includes(flow.needle);
		const reached = exitOk ? covered : covered && flow.done && text.includes(flow.done);
		if (reached) pass += 1;
		else if (!covered) fails.push(`${flow.id}: e2e.mjs does not mention "${flow.needle}"`);
		else fails.push(`${flow.id}: e2e did not reach it`);
	}
	const tail = text.trim().split("\n").filter(Boolean).at(-1) ?? "";
	const body = {
		pass,
		total: live.length,
		e2e: exitOk ? "pass" : "fail",
		chrome,
		first_fail: fails[0] ?? (exitOk ? "" : tail.slice(0, 300)),
	};
	if (!exitOk) body.tail = tail.slice(0, 300);
	if (args.has("--all")) body.fails = fails;
	return body;
}

function styleOf(name) {
	const html = readFileSync(join(root, name), "utf8");
	const match = html.match(/<style>([\s\S]*?)<\/style>/);
	if (!match) throw new Error(`${name} has no style block`);
	return match[1];
}

function ruleBlock(css, selector) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = css.match(new RegExp(`(?:^|\\n)[ \\t]*${escaped}[ \\t]*\\{([^}]*)\\}`));
	return match ? match[1] : null;
}

function decl(block, prop) {
	if (!block) return null;
	const match = block.match(new RegExp(`(?:^|[;{\\n])\\s*${prop}\\s*:\\s*([^;]+)`));
	return match ? match[1].trim() : null;
}

function pxList(value) {
	if (!value) return null;
	const parts = value.trim().split(/\s+/).map((part) => (part.endsWith("px") ? Number.parseFloat(part) : Number.NaN));
	if (parts.some((part) => Number.isNaN(part))) return null;
	return parts;
}

function padY(value) {
	const parts = pxList(value ?? "0px");
	if (!parts) return null;
	if (parts.length === 1) return parts[0] * 2;
	if (parts.length === 2) return parts[0] * 2;
	if (parts.length === 3) return parts[0] + parts[2];
	return parts[0] + parts[2];
}

function borderY(value) {
	if (!value || value === "none" || value === "0" || value.startsWith("0px") || value.startsWith("0 ")) return 0;
	const match = value.match(/^(\d+(?:\.\d+)?)px/);
	if (!match) return null;
	return Number(match[1]) * 2;
}

function linePx(block, bodyBlock) {
	const own = decl(block, "line-height");
	const font = decl(block, "font");
	const source = !font || font === "inherit" ? decl(bodyBlock, "font") : font;
	const sized = source?.match(/(\d+(?:\.\d+)?)px\s*\/\s*(\d+(?:\.\d+)?)/);
	if (!sized) return null;
	const size = Number(sized[1]);
	if (own) {
		if (own.endsWith("px")) return Number.parseFloat(own);
		const unitless = Number(own);
		if (!Number.isNaN(unitless)) return size * unitless;
	}
	const line = Number(sized[2]);
	return line < 4 ? size * line : line;
}

function borderBoxHeight(block, bodyBlock) {
	if (!block) return null;
	const sizing = decl(block, "box-sizing") ?? "content-box";
	const py = padY(decl(block, "padding"));
	const by = borderY(decl(block, "border") ?? "0");
	if (py === null || by === null) return null;
	const specified = decl(block, "height");
	const minH = decl(block, "min-height");
	const asPx = (value) => (value?.endsWith("px") ? Number.parseFloat(value) : null);
	if (sizing === "border-box" && asPx(specified) !== null) return Math.max(asPx(specified), asPx(minH) ?? 0);
	const content = asPx(specified) ?? linePx(block, bodyBlock);
	if (content === null) return null;
	const box = content + py + by;
	const min = asPx(minH);
	if (min === null) return box;
	return sizing === "border-box" ? Math.max(box, min) : Math.max(box, min + py + by);
}

function hexChannels(hex) {
	const raw = hex.replace("#", "");
	const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
	return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16));
}

function resolveColor(token, vars, depth = 0) {
	if (!token || depth > 6) return null;
	token = token.trim();
	if (token.startsWith("#")) return hexChannels(token);
	const ref = token.match(/^var\(--([\w-]+)\)$/);
	if (ref) return resolveColor(vars[ref[1]], vars, depth + 1);
	const mix = token.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/);
	if (!mix) return null;
	const a = resolveColor(mix[1], vars, depth + 1);
	const b = resolveColor(mix[3], vars, depth + 1);
	if (!a || !b) return null;
	const p = Number(mix[2]) / 100;
	return a.map((channel, index) => channel * p + b[index] * (1 - p));
}

function luminance(channels) {
	const lin = channels.map((channel) => {
		const s = channel / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a, b) {
	const hi = Math.max(luminance(a), luminance(b));
	const lo = Math.min(luminance(a), luminance(b));
	return (hi + 0.05) / (lo + 0.05);
}

function varsOf(block) {
	const out = {};
	for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].trim();
	return out;
}

const contrastPairs = [
	["ticket text", "ink", "paper"],
	["link and remaining time", "ink-soft", "paper"],
	["note", "text", "field"],
];

const unmeasuredUi = [
	"options.html contrast: the page sets no background, and a headless load paints the body transparent, so contrast against the toolbar popup is not measured",
	"options day toggles: options.js builds them and needs chrome.storage, so their hit size is not measured",
	"blocked page link hit size: the link text is filled in at runtime",
	"layout at 390px and 1280px, and Lighthouse: the pages are extension documents, and this meter does not score them",
];

function uiChecks() {
	const checks = [];
	const unmeasured = [...unmeasuredUi];
	let blocked;
	let options;
	try {
		blocked = styleOf("blocked.html");
		options = styleOf("options.html");
	} catch (error) {
		return { pass: 0, total: 0, score: "error", first_fail: error.message, unmeasured };
	}
	const roots = [...blocked.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) => match[1]);
	if (roots.length < 2) {
		unmeasured.push("blocked.html: expected a light :root and a dark :root");
	} else {
		const light = varsOf(roots[0]);
		const dark = { ...light, ...varsOf(roots[1]) };
		for (const [scheme, vars] of [
			["light", light],
			["dark", dark],
		]) {
			for (const [name, fg, bg] of contrastPairs) {
				const id = `contrast-${scheme}-${fg}`;
				const fore = resolveColor(vars[fg], vars);
				const back = resolveColor(vars[bg], vars);
				if (!fore || !back) {
					unmeasured.push(`${id}: could not resolve ${fg} on ${bg}`);
					continue;
				}
				const ratio = contrast(fore, back);
				const pass = ratio >= 4.5;
				checks.push({
					id,
					pass,
					detail: pass ? "" : `${id}: ${name} is ${ratio.toFixed(2)}:1, want at least 4.5:1`,
				});
			}
		}
	}
	const body = ruleBlock(options, "body");
	const targets = [
		["target-save", "Save button is", [ruleBlock(options, "button")]],
		[
			"target-hours",
			"hour fields are",
			[ruleBlock(options, 'textarea, input[type="number"]'), ruleBlock(options, 'input[type="number"]')],
		],
	];
	for (const [id, name, blocks] of targets) {
		if (blocks.some((block) => !block)) {
			unmeasured.push(`${id}: ${name} rule is missing in options.html`);
			continue;
		}
		const height = borderBoxHeight(blocks.join(";"), body);
		if (height === null) {
			unmeasured.push(`${id}: could not read the font, padding, and border for ${name}`);
			continue;
		}
		const pass = height >= 44;
		checks.push({
			id,
			pass,
			detail: pass ? "" : `${id}: ${name} ${height}px tall, want at least 44px`,
		});
	}
	return { checks, unmeasured };
}

function gate() {
	if (args.has("--no-gate")) return { score: "skipped", first_fail: "" };
	const run = spawnSync(join(root, "scripts/verify.sh"), { cwd: root, encoding: "utf8" });
	if (run.status === 0) return { score: "yes", first_fail: "" };
	const tail = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.trim().split("\n").filter(Boolean).at(-1) ?? run.error?.message ?? "";
	return { score: "no", first_fail: tail.slice(0, 300) };
}

const dropped = deviations();
const allSchedule = [...scheduleChecks(), ...permissionChecks()];
const schedule = keep(allSchedule, dropped);
const e2eSource = readFileSync(join(root, "e2e.mjs"), "utf8");
const allCoverage = flowChecks(e2eSource);
const coverage = keep(allCoverage, dropped);
const ui = uiChecks();
const uiLive = ui.checks ? keep(ui.checks, dropped) : [];
const known = new Set([...allSchedule, ...allCoverage, ...(ui.checks ?? []), ...flows].map((item) => item.id));
const unknown = [...dropped].filter((id) => !known.has(id));

const commitRun = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
const commit = commitRun.stdout.trim() || "unknown";
const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout.trim() !== "";

const r4 = ui.checks ? summarize(uiLive, { unmeasured: ui.unmeasured }) : { ...ui, unmeasured: ui.unmeasured };

console.log(
	JSON.stringify({
		commit: dirty ? `${commit}+dirty` : commit,
		machine: hostname(),
		unknown_deviations: unknown,
		R0: gate(),
		R1: summarize(schedule),
		R2: summarize(coverage),
		R3: device(e2eSource, dropped),
		R4: r4,
		R5: {
			score: "manual",
			how: "the owner signs off on docs/screenshots and docs/demo-light.gif and docs/demo-dark.gif",
			first_fail: "",
		},
	}),
);
