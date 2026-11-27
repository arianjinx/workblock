import { blockedPageUrl, hostMatches } from "./schedule.js";

export const BLOCKED_PAGE = chrome.runtime.getURL("blocked.html");
export const onSafari = BLOCKED_PAGE.startsWith("safari-web-extension:");

const RESEND_AFTER_MS = 2000;
const lastSentAt = new Map();

export function sendToBlockedPage(tabId, url) {
	const now = Date.now();
	if (now - (lastSentAt.get(tabId) ?? -Infinity) < RESEND_AFTER_MS) return;
	lastSentAt.set(tabId, now);
	return chrome.tabs.update(tabId, { url: blockedPageUrl(BLOCKED_PAGE, url) });
}

export const forgetTab = (tabId) => lastSentAt.delete(tabId);

export async function sweepOpenTabs(sites) {
	for (const tab of await chrome.tabs.query({})) {
		if (tab.url && hostMatches(tab.url, sites)) sendToBlockedPage(tab.id, tab.url);
	}
}
