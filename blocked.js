import { DEFAULTS, hostMatches, isWorkHours, webReturnUrl } from "./schedule.js";

const $ = (id) => document.getElementById(id);
const url = webReturnUrl(location.search);

if (url) {
	document.title = url;
	const host = new URL(url).hostname.replace(/^www\./, "");
	$("host").textContent = host;
	$("host").style.setProperty("--host-length", host.length);
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

function returnLegacySweptTab() {
	if (history.length > 1) history.back();
}

async function returnVisibleTabIfFree() {
	const cfg = await chrome.storage.sync.get(DEFAULTS);
	const now = new Date();
	showReturnTime(cfg, now);
	if (document.hidden) return;
	if (url && !(isWorkHours(cfg, now) && hostMatches(url, cfg.sites))) location.replace(url);
	if (!url && !isWorkHours(cfg, now)) returnLegacySweptTab();
}

returnVisibleTabIfFree();
document.addEventListener("visibilitychange", returnVisibleTabIfFree);
chrome.storage.onChanged.addListener(returnVisibleTabIfFree);
setInterval(returnVisibleTabIfFree, 60_000);
