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
	startHour: 9,
	endHour: 17,
	days: [1, 2, 3, 4, 5],
};

export const isValidWindow = (cfg) => cfg.startHour < cfg.endHour;

export function isWorkHours(cfg, now) {
	if (!cfg.days.includes(now.getDay())) return false;
	const h = now.getHours();
	return h >= cfg.startHour && h < cfg.endHour;
}

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

export function blockedPageUrl(page, url) {
	return `${page}?url=${encodeURIComponent(url)}`;
}

export function webReturnUrl(search) {
	const url = new URLSearchParams(search).get("url");
	return /^https?:\/\//.test(url ?? "") ? url : null;
}
