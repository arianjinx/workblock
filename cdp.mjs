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
	for (;;) {
		const v = await fn().catch(() => undefined);
		if (v) return v;
		if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
		await sleep(250);
	}
}

export const targets = () => fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());

export function connect(wsUrl) {
	const ws = new WebSocket(wsUrl);
	let seq = 0;
	const pending = new Map();
	const errors = [];
	ws.onmessage = (e) => {
		const msg = JSON.parse(e.data);
		if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description);
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
	return new Promise((resolve) => (ws.onopen = () => resolve({ send, evaluate, errors, close: () => ws.close() })));
}

// Starts the browser in a throwaway profile and returns the function that
// kills it and deletes the profile.
export function launch(browserPath = DEFAULT_BROWSER) {
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
