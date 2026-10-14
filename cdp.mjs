// Raw CDP plumbing for driving a real browser with this folder loaded as an
// unpacked extension. Shared by e2e.mjs and demo.mjs.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_BROWSER = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = 9333;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(what, fn, timeout = 15000) {
	const end = Date.now() + timeout;
	let lastError;
	for (;;) {
		const v = await fn().catch((e) => void (lastError = e));
		if (v) return v;
		if (Date.now() > end) throw new Error(`timed out waiting for ${what}${lastError ? ` (last error: ${lastError.message})` : ""}`);
		await sleep(250);
	}
}

export const targets = () => fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());

export function connect(wsUrl) {
	const ws = new WebSocket(wsUrl);
	let seq = 0;
	const pending = new Map();
	const errors = [];
	const opened = Promise.withResolvers();
	let gone;
	const fail = (why) => {
		gone ??= new Error(`CDP connection to ${wsUrl} ${why}`);
		opened.reject(gone);
		for (const reply of pending.values()) reply.reject(gone);
		pending.clear();
	};
	ws.onerror = () => fail("hit a socket error");
	ws.onclose = (e) => fail(`closed (code ${e.code}${e.reason ? `: ${e.reason}` : ""})`);
	ws.onmessage = (e) => {
		const msg = JSON.parse(e.data);
		if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description);
		const reply = pending.get(msg.id);
		if (!reply) return;
		pending.delete(msg.id);
		if (msg.error) reply.reject(new Error(msg.error.message));
		else reply.resolve(msg.result);
	};
	const send = (method, params = {}) => {
		if (gone) return Promise.reject(gone);
		const id = ++seq;
		const reply = Promise.withResolvers();
		pending.set(id, reply);
		ws.send(JSON.stringify({ id, method, params }));
		return reply.promise;
	};
	const evaluate = async (expression) => {
		const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
		if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
		return r.result.value;
	};
	ws.onopen = () => opened.resolve({ send, evaluate, errors, close: () => ws.close() });
	return opened.promise;
}

// Connects to Workblock's background service worker and returns it with the
// extension's base URL. Chrome ships component extensions ("Contextual Tasks")
// whose worker is also a background.js, and a worker is listed before its
// script has run, so each candidate is asked for its manifest name until one
// answers "Workblock" with storage ready.
export async function connectWorker() {
	return waitFor("the Workblock service worker", async () => {
		for (const t of await targets()) {
			if (t.type !== "service_worker" || !t.url.endsWith("/background.js")) continue;
			const ext = await connect(t.webSocketDebuggerUrl);
			const ours = await ext
				.evaluate(`globalThis.chrome?.runtime?.getManifest?.().name === "Workblock" && !!chrome.storage?.sync`)
				.catch(() => false);
			if (!ours) {
				ext.close();
				continue;
			}
			await ext.send("Runtime.enable");
			return { ext, extBase: t.url.replace(/background\.js$/, "") };
		}
	});
}

// Starts the browser in a throwaway profile and returns the function that
// kills it and deletes the profile.
export async function launch(browserPath = DEFAULT_BROWSER) {
	if (await fetch(`http://127.0.0.1:${PORT}/json/version`).then(() => true, () => false)) {
		throw new Error(`something already answers on port ${PORT}; another e2e or demo run is probably using it`);
	}
	const profile = mkdtempSync(join(tmpdir(), "workblock-"));
	const browser = spawn(browserPath, [
		`--user-data-dir=${profile}`,
		`--remote-debugging-port=${PORT}`,
		`--load-extension=${import.meta.dirname}`,
		`--disable-extensions-except=${import.meta.dirname}`,
		"--no-first-run",
		"--no-default-browser-check",
		"about:blank",
	]);
	return async () => {
		browser.kill();
		await sleep(500);
		rmSync(profile, { recursive: true, force: true });
	};
}
