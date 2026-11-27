import { DEFAULTS, buildRules, hostMatches, isWorkHours } from "./schedule.js";
import { sendToBlockedPage, sweepOpenTabs } from "./tabs.js";

const canClearSiteData = () => "browsingData" in chrome;

async function dropServiceWorkers(sites) {
	if (!sites.length || !canClearSiteData()) return;
	const origins = sites.flatMap((s) => [`https://${s}`, `https://www.${s}`]);
	await chrome.browsingData.remove({ origins }, { serviceWorkers: true, cacheStorage: true });
}

export const rulesFor = async (sites) => buildRules(sites);

export async function evict(sites) {
	await sweepOpenTabs(sites);
	await dropServiceWorkers(sites);
}

async function bounceBlockedVisit(tabId, { url: reportedUrl }) {
	if (!reportedUrl) return;
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	if (!isWorkHours(cfg, new Date())) return;
	const tab = await chrome.tabs.get(tabId).catch(() => null);
	const liveUrl = tab?.pendingUrl ?? tab?.url;
	if (liveUrl && hostMatches(liveUrl, cfg.sites)) sendToBlockedPage(tabId, liveUrl);
}

export function watchVisits() {
	chrome.tabs.onUpdated.addListener(bounceBlockedVisit);
}
