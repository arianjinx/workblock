import { DEFAULTS, hostMatches, isWorkHours, returnUrl } from "./schedule.js";

const $ = (id) => document.getElementById(id);
const url = returnUrl(location.search);

if (url) {
	document.title = url;
	const host = new URL(url).hostname.replace(/^www\./, "");
	$("host").textContent = host;
	$("host").style.setProperty("--chars", host.length);
	$("url").href = url;
	$("url").textContent = url;
} else {
	$("url").hidden = true;
	$("legacy").hidden = false;
}

function showReturnTime(cfg, now) {
	const end = new Date(now);
	end.setHours(cfg.endHour, 0, 0, 0);
	const mins = Math.max(0, Math.ceil((end - now) / 60_000));
	const h = Math.floor(mins / 60);
	$("time").textContent = `${String(cfg.endHour).padStart(2, "0")}:00`;
	$("left").textContent = `in ${h ? `${h} h ` : ""}${mins % 60} min`;
}

// Only the visible tab goes back, so a dozen hidden tabs don't all reload the
// moment the window ends. The rest go back when you switch to them.
async function returnIfFree() {
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	const now = new Date();
	showReturnTime(cfg, now);
	if (document.hidden) return;
	if (url && !(isWorkHours(cfg, now) && hostMatches(url, cfg.sites))) location.replace(url);
	// Tabs swept before the page kept its URL still have the site one step back.
	if (!url && !isWorkHours(cfg, now) && history.length > 1) history.back();
}

returnIfFree();
document.addEventListener("visibilitychange", returnIfFree);
chrome.storage.onChanged.addListener(returnIfFree);
setInterval(returnIfFree, 60_000);
