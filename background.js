import { DEFAULTS, buildRules, isWorkHours } from "./schedule.js";

async function sync() {
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	const blocking = isWorkHours(cfg, new Date());
	const old = await chrome.declarativeNetRequest.getDynamicRules();

	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: old.map((r) => r.id),
		addRules: blocking ? buildRules(cfg.sites) : [],
	});

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
