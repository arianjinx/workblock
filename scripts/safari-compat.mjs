import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [source] = process.argv.slice(2);
if (!source) {
	console.error("usage: node scripts/safari-compat.mjs <path to @mdn/browser-compat-data data.json>");
	process.exit(1);
}

const bcd = JSON.parse(readFileSync(source, "utf8"));
const BROWSERS = ["safari", "safari_ios"];
const DEPTH = { api: 4, manifest: 2 };

function earliest(support) {
	const versions = [support ?? []]
		.flat()
		.filter((statement) => !statement.flags && !statement.prefix && !statement.alternative_name)
		.map((statement) => statement.version_added)
		.filter((version) => typeof version === "string" && /^≤?\d/.test(version))
		.map((version) => version.replace("≤", ""));
	return versions.sort((a, b) => a.localeCompare(b, "en", { numeric: true }))[0] ?? null;
}

const entries = {};
function walk(node, path, depth) {
	if (node.__compat) {
		const entry = {};
		for (const browser of BROWSERS) entry[browser] = earliest(node.__compat.support[browser]);
		const notes = BROWSERS.flatMap((browser) => [node.__compat.support[browser] ?? []].flat().flatMap((s) => [s.notes ?? []].flat()));
		if (notes.some((note) => /requires host permissions/i.test(note))) entry.host_access = true;
		entries[path.join(".")] = entry;
	}
	if (depth === 0) return;
	for (const [key, child] of Object.entries(node)) {
		if (key !== "__compat" && child && typeof child === "object") walk(child, [...path, key], depth - 1);
	}
}
for (const [area, depth] of Object.entries(DEPTH)) walk(bcd.webextensions[area], [area], depth);

const snapshot = { source: `@mdn/browser-compat-data ${bcd.__meta.version}`, entries };
const lines = Object.entries(entries).map(([key, entry]) => `\t\t${JSON.stringify(key)}: ${JSON.stringify(entry)}`);
writeFileSync(
	join(import.meta.dirname, "safari-compat.json"),
	`{\n\t"source": ${JSON.stringify(snapshot.source)},\n\t"entries": {\n${lines.join(",\n")}\n\t}\n}\n`,
);
console.log(`${Object.keys(entries).length} entries from ${snapshot.source}`);
