import { DEFAULTS, isWorkHours, parseSites } from "./schedule.js";

const $ = (id) => document.getElementById(id);
const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

const cfg = await chrome.storage.sync.get(DEFAULTS);

$("sites").value = cfg.sites.join("\n");
$("startHour").value = cfg.startHour;
$("endHour").value = cfg.endHour;

$("days").innerHTML = DAY_NAMES.map(
	(name, i) =>
		`<label title="${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}">
			<input type="checkbox" value="${i}" ${cfg.days.includes(i) ? "checked" : ""} />${name}
		</label>`,
).join("");

function showStatus(c) {
	const blocking = isWorkHours(c, new Date());
	const el = $("status");
	el.dataset.blocking = blocking;
	el.textContent = blocking
		? `Blocking now, until ${String(c.endHour).padStart(2, "0")}:00`
		: c.days.length && c.sites.length
			? "Off the clock. Nothing blocked."
			: "Inactive: add sites and days.";
}
showStatus(cfg);

$("save").addEventListener("click", async () => {
	const next = {
		sites: parseSites($("sites").value),
		startHour: Number($("startHour").value),
		endHour: Number($("endHour").value),
		days: [...$("days").querySelectorAll(":checked")].map((el) => Number(el.value)),
	};
	await chrome.storage.sync.set(next);
	$("sites").value = next.sites.join("\n"); // reflect the normalised list back
	showStatus(next);
	$("saved").classList.add("show");
	setTimeout(() => $("saved").classList.remove("show"), 1200);
});
