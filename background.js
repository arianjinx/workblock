import { DEFAULTS, buildRules, isWorkHours } from "./schedule.js";
import * as chromeBlocking from "./chrome-blocking.js";
import * as safariBlocking from "./safari-blocking.js";
import { forgetTab, onSafari } from "./tabs.js";

const platform = onSafari ? safariBlocking : chromeBlocking;

async function installRules(rules) {
	const old = await chrome.declarativeNetRequest.getDynamicRules();
	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: [...new Set([...old, ...rules].map((r) => r.id))],
		addRules: rules,
	});
}

async function applyScheduleNow() {
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	const blocking = isWorkHours(cfg, new Date());

	if (blocking) await installRules(await platform.rulesFor(cfg.sites)).catch(() => installRules(buildRules(cfg.sites)));
	else await installRules([]);

	if (blocking) await platform.evict(cfg.sites);

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
chrome.permissions.onRemoved.addListener(applySchedule);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
	if (message !== "apply-schedule") return false;
	applySchedule().then(reply);
	return true;
});
chrome.tabs.onRemoved.addListener(forgetTab);
platform.watchVisits();
