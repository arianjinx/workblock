import { DEFAULTS, hostMatches, isWorkHours, returnUrl } from "./schedule.js";

const url = returnUrl(location.search);

if (url) {
	document.title = url;
	document.getElementById("url").href = url;
	document.getElementById("url").textContent = url;
} else {
	document.getElementById("legacy").hidden = false;
}

// Only the visible tab goes back, so a dozen hidden tabs don't all reload the
// moment the window ends. The rest go back when you switch to them.
async function returnIfFree() {
	if (document.hidden) return;
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	const now = new Date();
	if (url && !(isWorkHours(cfg, now) && hostMatches(url, cfg.sites))) location.replace(url);
	// Tabs swept before the page kept its URL still have the site one step back.
	if (!url && !isWorkHours(cfg, now) && history.length > 1) history.back();
}

returnIfFree();
document.addEventListener("visibilitychange", returnIfFree);
chrome.storage.onChanged.addListener(returnIfFree);
setInterval(returnIfFree, 60_000);
