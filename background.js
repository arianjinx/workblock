import { DEFAULTS, blockedPageUrl, buildRules, hostMatches, isWorkHours } from "./schedule.js";

const BLOCKED_PAGE = chrome.runtime.getURL("blocked.html");

const RESEND_AFTER_MS = 2000;
const lastSentAt = new Map();

function sendToBlockedPage(tabId, url) {
	const now = Date.now();
	if (now - (lastSentAt.get(tabId) ?? -Infinity) < RESEND_AFTER_MS) return;
	lastSentAt.set(tabId, now);
	return chrome.tabs.update(tabId, { url: blockedPageUrl(BLOCKED_PAGE, url) });
}
chrome.tabs.onRemoved.addListener((tabId) => lastSentAt.delete(tabId));

const canClearSiteData = () => "browsingData" in chrome;

async function dropServiceWorkers(sites) {
	if (!sites.length || !canClearSiteData()) return;
	const origins = sites.flatMap((s) => [`https://${s}`, `https://www.${s}`]);
	await chrome.browsingData.remove({ origins }, { serviceWorkers: true, cacheStorage: true });
}

async function sweepOpenTabs(sites) {
	for (const tab of await chrome.tabs.query({})) {
		if (tab.url && hostMatches(tab.url, sites)) sendToBlockedPage(tab.id, tab.url);
	}
}

async function evictBlockedSites(sites) {
	await sweepOpenTabs(sites);
	await dropServiceWorkers(sites);
}

async function applyScheduleNow() {
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	const blocking = isWorkHours(cfg, new Date());
	const old = await chrome.declarativeNetRequest.getDynamicRules();
	const rules = blocking ? buildRules(cfg.sites) : [];

	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: [...new Set([...old, ...rules].map((r) => r.id))],
		addRules: rules,
	});

	if (blocking) await evictBlockedSites(cfg.sites);

	chrome.action.setBadgeText({ text: blocking ? "ON" : "" });
	chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
	return { blocking, sites: cfg.sites };
}

let lastApply = Promise.resolve();
const applySchedule = () => (lastApply = lastApply.then(applyScheduleNow, applyScheduleNow));

chrome.runtime.onInstalled.addListener(() => {
	chrome.alarms.create("tick", { periodInMinutes: 1 });
	applySchedule();
});
chrome.runtime.onStartup.addListener(applySchedule);
chrome.alarms.onAlarm.addListener(applySchedule);
chrome.storage.onChanged.addListener(applySchedule);
chrome.permissions.onAdded.addListener(applySchedule);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
	if (message !== "apply-schedule") return false;
	applySchedule().then(reply);
	return true;
});

async function bounceBlockedVisit(tabId, { url: reportedUrl }) {
	if (!reportedUrl) return;
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	if (!isWorkHours(cfg, new Date())) return;
	const tab = await chrome.tabs.get(tabId).catch(() => null);
	const liveUrl = tab?.pendingUrl ?? tab?.url;
	if (liveUrl && hostMatches(liveUrl, cfg.sites)) sendToBlockedPage(tabId, liveUrl);
}
chrome.tabs.onUpdated.addListener(bounceBlockedVisit);
