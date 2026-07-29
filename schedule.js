// Pure logic, no chrome APIs, so test.mjs can import it under plain node.

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

export function isWorkHours(cfg, now) {
	if (!cfg.days.includes(now.getDay())) return false;
	const h = now.getHours();
	return h >= cfg.startHour && h < cfg.endHour;
}

// requestDomains matches the domain AND its subdomains, so "x.com" already
// covers www.x.com and mobile.x.com. No www. variants needed.
export function buildRules(sites) {
	return sites.map((site, i) => ({
		id: i + 1,
		priority: 1,
		action: { type: "block" },
		condition: { requestDomains: [site], resourceTypes: ["main_frame"] },
	}));
}

export function parseSites(text) {
	return text
		.split("\n")
		.map((line) => line.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
		.filter((line) => line && !line.startsWith("#"));
}
