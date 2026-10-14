// End-to-end check in a real browser: node e2e.mjs [path-to-browser]
// Loads this folder as an unpacked extension into a throwaway profile, blocks
// example.com, and checks a swept tab still knows where it came from.
import assert from "node:assert/strict";
import { connect, connectWorker, launch, sleep, targets, waitFor } from "./cdp.mjs";
import { blockedPageUrl } from "./schedule.js";

const ORIGINAL = "https://example.com/some/page?q=1#frag";
const ALWAYS = { startHour: 0, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6] };

const close = await launch(process.argv[2]);

try {
	const { ext, extBase } = await connectWorker();
	const setCfg = (cfg) => ext.evaluate(`chrome.storage.sync.set(${JSON.stringify(cfg)})`);
	const openTab = (url, active = true) => ext.evaluate(`chrome.tabs.create(${JSON.stringify({ url, active })}).then(t => t.id)`);
	const tabUrl = (id) => ext.evaluate(`chrome.tabs.get(${id}).then(t => t.url)`);
	const landsOn = (id, url, what, timeout) => waitFor(what, async () => (await tabUrl(id)) === url, timeout);

	await setCfg({ sites: [], ...ALWAYS });
	const tab = await openTab(ORIGINAL);
	await landsOn(tab, ORIGINAL, "example.com to load");

	await setCfg({ sites: ["example.com"] });
	const swept = await waitFor("tab to be swept", async () => {
		const u = await tabUrl(tab);
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

	await setCfg({ sites: [] });
	await landsOn(tab, ORIGINAL, "tab to return once unblocked");
	console.log("ok - swept tab returns once unblocked");

	const reopened = await openTab(swept);
	await landsOn(reopened, ORIGINAL, "reopened blocked tab to return");
	console.log("ok - blocked tab reopened from a saved group returns");

	const hiddenUrl = "https://example.com/hidden";
	const hidden = await openTab(hiddenUrl, false);
	await landsOn(hidden, hiddenUrl, "background tab to load");
	await setCfg({ sites: ["example.com"] });
	await waitFor("background tab to be swept", async () => (await tabUrl(hidden))?.startsWith(extBase));
	await setCfg({ sites: [] });
	await sleep(3000);
	assert.ok((await tabUrl(hidden)).startsWith(extBase), "background tab waits until it is viewed");
	await ext.evaluate(`chrome.tabs.update(${hidden}, { active: true }).then(() => true)`);
	await landsOn(hidden, hiddenUrl, "background tab to return when viewed");
	console.log("ok - background tab returns when viewed, not before");

	const legacyUrl = "https://example.com/legacy";
	const legacy = await openTab(legacyUrl);
	await landsOn(legacy, legacyUrl, "legacy tab to load");
	await ext.evaluate(`chrome.tabs.update(${legacy}, { url: ${JSON.stringify(extBase + "blocked.html")} }).then(() => true)`);
	await setCfg({ days: [] });
	await landsOn(legacy, legacyUrl, "bare blocked tab to step back once off the clock");
	console.log("ok - tab swept by the old version steps back once off the clock");

	const freshUrl = "https://example.com/fresh";
	await setCfg({ sites: ["example.com"], ...ALWAYS });
	await waitFor("block rules", () => ext.evaluate(`chrome.declarativeNetRequest.getDynamicRules().then(r => r.length > 0)`));
	const fresh = await openTab(freshUrl);
	await landsOn(fresh, blockedPageUrl(extBase + "blocked.html", freshUrl), "new visit to land on the blocked page", 5000);
	console.log("ok - a new visit during a block lands on the blocked page, not the browser error");

	const ruleCount = () => ext.evaluate(`chrome.declarativeNetRequest.getDynamicRules().then(r => r.length)`);
	await setCfg({ days: [] });
	await waitFor("rules cleared", async () => (await ruleCount()) === 0);
	await ext.evaluate(`Promise.all([
		chrome.storage.sync.set({ days: ${JSON.stringify(ALWAYS.days)} }),
		chrome.storage.sync.set({ sites: ["example.com", "example.org"] }),
	]).then(() => true)`);
	await sleep(2000);
	assert.equal(await ruleCount(), 2, "rules match the last settings after overlapping syncs");
	assert.deepEqual(ext.errors, [], "background script threw nothing");
	console.log("ok - overlapping syncs leave one consistent rule set and no errors");

	console.log("ok - e2e passed");
} finally {
	await close();
}
