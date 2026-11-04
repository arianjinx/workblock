export const DEFAULTS = {
	sites: [
		"x.com",
		"twitter.com",
		"facebook.com",
		"instagram.com",
		"threads.net",
		"tiktok.com",
		"reddit.com",
		"youtube.com",
		"linkedin.com",
		"news.ycombinator.com",
	],
	startHour: 9, // inclusive
	endHour: 17, // exclusive: 16:59 blocked, 17:00 free
	days: [1, 2, 3, 4, 5], // Date#getDay, 0=Sun .. 6=Sat
};

export const isValidWindow = (cfg) => cfg.startHour < cfg.endHour;

export function isWorkHours(cfg, now) {
	if (!cfg.days.includes(now.getDay())) return false;
	const h = now.getHours();
	return h >= cfg.startHour && h < cfg.endHour;
}

// Saved lists may hold capitals from before parseSites lowercased them, so match lowercase.
// requestDomains matches the domain AND its subdomains, so "x.com" already
// covers www.x.com and mobile.x.com. No www. variants needed.
export function buildRules(sites) {
	return sites.map((site, i) => ({
		id: i + 1,
		priority: 1,
		action: { type: "block" },
		condition: { requestDomains: [site.toLowerCase()], resourceTypes: ["main_frame"] },
	}));
}

export function hostMatches(url, sites) {
	let host;
	try {
		host = new URL(url).hostname;
	} catch {
		return false;
	}
	return sites.some((site) => {
		site = site.toLowerCase();
		return host === site || host.endsWith(`.${site}`);
	});
}

export function parseSites(text) {
	return text
		.split("\n")
		.map((line) => line.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
		.filter((line) => line && !line.startsWith("#"));
}

// The blocked page carries the URL it replaced. Brave's saved tab groups keep
// only a tab's current URL, so without this the original link is gone for good.
export function blockedPageUrl(page, url) {
	return `${page}?url=${encodeURIComponent(url)}`;
}

export function webReturnUrl(search) {
	const url = new URLSearchParams(search).get("url");
	return /^https?:\/\//.test(url ?? "") ? url : null;
}
