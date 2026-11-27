import { buildRedirectRules, siteOrigins } from "./schedule.js";
import { BLOCKED_PAGE, sweepOpenTabs } from "./tabs.js";

const hasSiteAccess = (site) => chrome.permissions.contains({ origins: siteOrigins([site]) }).catch(() => false);

export async function rulesFor(sites) {
	const access = await Promise.all(sites.map(hasSiteAccess));
	return buildRedirectRules(sites, BLOCKED_PAGE, new Set(sites.filter((_, i) => access[i])));
}

export const evict = sweepOpenTabs;

export function watchVisits() {}
