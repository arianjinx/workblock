// End-to-end check in a real browser: node e2e.mjs [path-to-browser]
// Loads this folder as an unpacked extension into a throwaway profile, blocks
// example.com, and checks a swept tab still knows where it came from.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSER = process.argv[2] ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = 9333;
const ORIGINAL = "https://example.com/some/page?q=1#frag";
const ALWAYS = { startHour: 0, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6] };

const profile = mkdtempSync(join(tmpdir(), "workblock-e2e-"));
const browser = spawn(BROWSER, [
	`--user-data-dir=${profile}`,
	`--remote-debugging-port=${PORT}`,
	`--load-extension=${import.meta.dirname}`,
	`--disable-extensions-except=${import.meta.dirname}`,
	"--no-first-run",
	"--no-default-browser-check",
	"about:blank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, fn, timeout = 15000) {
	const end = Date.now() + timeout;
	for (;;) {
		const v = await fn().catch(() => undefined);
		if (v) return v;
		if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
		await sleep(250);
	}
}

const targets = () => fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());

function connect(wsUrl) {
	const ws = new WebSocket(wsUrl);
	let seq = 0;
	const pending = new Map();
	ws.onmessage = (e) => {
		const msg = JSON.parse(e.data);
		pending.get(msg.id)?.(msg);
		pending.delete(msg.id);
	};
	const send = (method, params = {}) =>
		new Promise((resolve, reject) => {
			const id = ++seq;
			pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
			ws.send(JSON.stringify({ id, method, params }));
		});
	const evaluate = async (expression) => {
		const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
		if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
		return r.result.value;
	};
	return new Promise((resolve) => (ws.onopen = () => resolve({ send, evaluate, close: () => ws.close() })));
}

try {
	const sw = await waitFor("extension service worker", async () =>
		(await targets()).find((t) => t.type === "service_worker" && t.url.endsWith("/background.js")),
	);
	const ext = await connect(sw.webSocketDebuggerUrl);
	const extBase = sw.url.replace(/background\.js$/, "");
	await ext.evaluate(`chrome.storage.sync.set(${JSON.stringify({ sites: [], ...ALWAYS })})`);
	const tabId = await ext.evaluate(`chrome.tabs.create({ url: ${JSON.stringify(ORIGINAL)} }).then(t => t.id)`);
	const tabUrl = () => ext.evaluate(`chrome.tabs.get(${tabId}).then(t => t.url)`);
	await waitFor("example.com to load", async () => (await tabUrl()) === ORIGINAL);

	await ext.evaluate(`chrome.storage.sync.set({ sites: ["example.com"] })`);
	const swept = await waitFor("tab to be swept", async () => {
		const u = await tabUrl();
		return u?.startsWith(extBase) && u;
	});
	console.log("swept tab url:", swept);
	assert.equal(new URL(swept).searchParams.get("url"), ORIGINAL, "blocked tab keeps the original URL");

	const page = await connect(
		(await waitFor("blocked page target", async () => (await targets()).find((t) => t.url.startsWith(extBase + "blocked.html"))))
			.webSocketDebuggerUrl,
	);
	await waitFor("link to render", async () => (await page.evaluate(`document.querySelector("a")?.href`)) === ORIGINAL);
	page.close();

	await ext.evaluate(`chrome.storage.sync.set({ sites: [] })`);
	const back = await waitFor("tab to return once unblocked", async () => {
		const u = await tabUrl();
		return u === ORIGINAL && u;
	});
	console.log("restored tab url:", back);

	console.log("ok - e2e passed");
} finally {
	browser.kill();
	await sleep(500);
	rmSync(profile, { recursive: true, force: true });
}
