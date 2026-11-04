import { DEFAULTS, blockedPageUrl, buildRules, hostMatches, isWorkHours } from "./schedule.js";

const BLOCKED_PAGE = chrome.runtime.getURL("blocked.html");

const sendToBlockedPage = (tabId, url) => chrome.tabs.update(tabId, { url: blockedPageUrl(BLOCKED_PAGE, url) });

// A site's own service worker answers navigations from its cache, so the request
// never reaches the network layer that declarativeNetRequest sits on. YouTube and
// a logged-in x.com both do this. Dropping their service worker forces the next
// navigation back onto the network, where the rules apply.
async function dropServiceWorkers(sites) {
	if (!sites.length) return;
	const origins = sites.flatMap((s) => [`https://${s}`, `https://www.${s}`]);
	await chrome.browsingData.remove({ origins }, { serviceWorkers: true, cacheStorage: true });
}

// Tabs already open when the window starts are still rendering the site, and
// clicking around in an SPA never issues a fresh navigation.
async function sweepOpenTabs(sites) {
	for (const tab of await chrome.tabs.query({})) {
		if (tab.url && hostMatches(tab.url, sites)) sendToBlockedPage(tab.id, tab.url);
	}
}

async function evictBlockedSites(sites) {
	await sweepOpenTabs(sites);
	await dropServiceWorkers(sites);
}

async function applySchedule() {
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	const blocking = isWorkHours(cfg, new Date());
	const old = await chrome.declarativeNetRequest.getDynamicRules();
	const rules = blocking ? buildRules(cfg.sites) : [];

	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: [...new Set([...old, ...rules].map((r) => r.id))],
		addRules: rules,
	});

	if (blocking) {
		// Unconditional and every tick, because onInstalled and onStartup both turn out
		// to be unreliable when an already-installed extension is reloaded. Only blocked
		// origins are touched.
		await evictBlockedSites(cfg.sites);
	}

	chrome.action.setBadgeText({ text: blocking ? "ON" : "" });
	chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
}

chrome.runtime.onInstalled.addListener(() => {
	chrome.alarms.create("tick", { periodInMinutes: 1 });
	applySchedule();
});
chrome.runtime.onStartup.addListener(applySchedule);
chrome.alarms.onAlarm.addListener(applySchedule);
chrome.storage.onChanged.addListener(applySchedule);

async function bounceBlockedVisit(tabId, { url }) {
	if (!url) return;
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	if (isWorkHours(cfg, new Date()) && hostMatches(url, cfg.sites)) sendToBlockedPage(tabId, url);
}
chrome.tabs.onUpdated.addListener(bounceBlockedVisit);
