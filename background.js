import { DEFAULTS, blockedPageUrl, buildRules, hostMatches, isWorkHours } from "./schedule.js";

const BLOCKED_PAGE = chrome.runtime.getURL("blocked.html");

// A site's own service worker answers navigations from its cache, so the request
// never reaches the network layer that declarativeNetRequest sits on. YouTube and
// a logged-in x.com both do this. Dropping their service worker forces the next
// navigation back onto the network, where the rules apply.
async function dropServiceWorkers(sites) {
	const origins = sites.flatMap((s) => [`https://${s}`, `https://www.${s}`]);
	await chrome.browsingData.remove({ origins }, { serviceWorkers: true, cacheStorage: true });
}

// Tabs already open when the window starts are still rendering the site, and
// clicking around in an SPA never issues a fresh navigation.
async function sweepOpenTabs(sites) {
	for (const tab of await chrome.tabs.query({})) {
		if (tab.url && hostMatches(tab.url, sites)) {
			chrome.tabs.update(tab.id, { url: blockedPageUrl(BLOCKED_PAGE, tab.url) });
		}
	}
}

async function sync() {
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	const blocking = isWorkHours(cfg, new Date());
	const old = await chrome.declarativeNetRequest.getDynamicRules();

	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: old.map((r) => r.id),
		addRules: blocking ? buildRules(cfg.sites) : [],
	});

	if (blocking) {
		// Order matters: a tab still sitting on the site re-registers the worker the
		// moment we drop it, so the tab has to go first. Unconditional and every tick,
		// because onInstalled and onStartup both turn out to be unreliable when an
		// already-installed extension is reloaded. Only blocked origins are touched.
		await sweepOpenTabs(cfg.sites);
		await dropServiceWorkers(cfg.sites);
	}

	chrome.action.setBadgeText({ text: blocking ? "ON" : "" });
	chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
}

// 1 min is the shortest period MV3 allows, and it is what wakes the service
// worker back up after Chrome suspends it.
chrome.runtime.onInstalled.addListener(() => {
	chrome.alarms.create("tick", { periodInMinutes: 1 });
	sync();
});
chrome.runtime.onStartup.addListener(sync);
chrome.alarms.onAlarm.addListener(sync);
chrome.storage.onChanged.addListener(sync);
