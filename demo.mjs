import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, connectWorker, launch, targets, waitFor } from "./cdp.mjs";
import { DEFAULTS } from "./schedule.js";

const DOCS = join(import.meta.dirname, "docs");
const SCREENSHOTS = join(DOCS, "screenshots");
const STAGE = { width: 1280, height: 800 };
const VIEWPORT = { width: 1200, height: 632 };
const POPUP_WIDTH = 360;
const READING = "https://news.ycombinator.com/newsguidelines.html";
const VISIT = "https://www.youtube.com/";

const hour = new Date().getHours();
const ON = { startHour: hour, endHour: Math.min(hour + 2, 24), days: [0, 1, 2, 3, 4, 5, 6] };
const OFF = { days: [] };

const ticketFor = (host) => `document.getElementById("host").textContent === ${JSON.stringify(host)}
	&& document.getElementById("time").textContent !== "--:--"`;

const SCENES = [
	{
		slug: "settings",
		caption: "Pick the sites and the hours to block",
		hold: 3.5,
		async run(s) {
			await s.setCfg({ sites: DEFAULTS.sites, ...ON });
			const popup = await s.open(s.extBase + "options.html");
			await popup.until("status to say blocking", `document.getElementById("status").textContent.startsWith("Blocking now")`);
			await popup.page.send("Emulation.setDeviceMetricsOverride", { width: POPUP_WIDTH, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
			const height = await popup.page.evaluate(`Math.ceil(document.body.getBoundingClientRect().height)`);
			return popup.shoot({ width: POPUP_WIDTH, height });
		},
	},
	{
		slug: "reading",
		caption: "Off the clock, every site opens as usual",
		hold: 3,
		async run(s) {
			await s.setCfg(OFF);
			s.reading = await s.open(READING);
			await s.reading.until("the guidelines to load", `location.href === ${JSON.stringify(READING)} && document.readyState === "complete"`);
			return s.reading.shoot();
		},
	},
	{
		slug: "block-starts",
		caption: "The block starts, and open tabs move to a claim ticket",
		hold: 3.5,
		async run(s) {
			await s.setCfg(ON);
			await s.reading.until("the tab to be swept", ticketFor("news.ycombinator.com"));
			return s.reading.shoot();
		},
	},
	{
		slug: "new-visit",
		caption: "A new visit during the block lands on a ticket too",
		hold: 3,
		async run(s) {
			const visit = await s.open(VISIT);
			await visit.until("the visit to land on a ticket", ticketFor("youtube.com"));
			return visit.shoot();
		},
	},
	{
		slug: "block-ends",
		caption: "The block ends, and the tab goes back by itself",
		hold: 3.5,
		async run(s) {
			await s.setCfg(OFF);
			await waitFor("the block rules to clear", async () => (await s.ruleCount()) === 0);
			await s.reading.page.send("Page.bringToFront");
			await s.reading.until("the tab to return", `location.href === ${JSON.stringify(READING)} && document.readyState === "complete"`);
			return s.reading.shoot();
		},
	},
];

const THEMES = {
	light: {
		bg: "#e8e8eb",
		window: "#ffffff",
		bar: "#f5f5f7",
		field: "#e9e9ed",
		dot: "#d4d4d8",
		line: "rgba(0, 0, 0, 0.1)",
		backdrop: "#f0f0f2",
		text: "#1d1d1f",
		muted: "#6e6e73",
		shadow: "0 1px 2px rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.1)",
	},
	dark: {
		bg: "#161618",
		window: "#1f1f22",
		bar: "#2a2a2e",
		field: "#3a3a3f",
		dot: "#4a4a50",
		line: "rgba(255, 255, 255, 0.1)",
		backdrop: "#232326",
		text: "#f2f2f4",
		muted: "#a1a1a8",
		shadow: "0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 32px rgba(0, 0, 0, 0.45)",
	},
};

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function stageHtml(t, shot, step, caption) {
	return `<!doctype html><html><head><meta charset="utf-8"><style>
		* { box-sizing: border-box; }
		html, body { margin: 0; width: ${STAGE.width}px; height: ${STAGE.height}px; overflow: hidden; }
		body {
			background: ${t.bg};
			color: ${t.text};
			font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
			-webkit-font-smoothing: antialiased;
			padding: 32px 40px 0;
		}
		.window { border-radius: 10px; overflow: hidden; background: ${t.window}; box-shadow: 0 0 0 1px ${t.line}, ${t.shadow}; }
		.bar { height: 44px; display: flex; align-items: center; gap: 18px; padding: 0 14px; background: ${t.bar}; border-bottom: 1px solid ${t.line}; }
		.dots { display: flex; gap: 8px; }
		.dots i { width: 12px; height: 12px; border-radius: 50%; background: ${t.dot}; }
		.url {
			flex: 1; min-width: 0; height: 28px; padding: 0 12px; border-radius: 7px;
			background: ${t.field}; color: ${t.muted}; font-size: 13px; line-height: 28px;
			white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
		}
		.view { width: ${VIEWPORT.width}px; height: ${VIEWPORT.height}px; display: grid; place-items: center; background: ${t.backdrop}; }
		.view img { display: block; box-shadow: 0 0 0 1px ${t.line}, ${t.shadow}; }
		.caption { height: ${STAGE.height - 32 - 44 - 1 - VIEWPORT.height}px; display: flex; align-items: center; gap: 14px; padding: 0 4px; }
		.step {
			width: 28px; height: 28px; border-radius: 50%; flex: none;
			display: grid; place-items: center;
			background: ${t.text}; color: ${t.bg}; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums;
		}
		.text { font-size: 20px; font-weight: 500; letter-spacing: -0.01em; }
		.brand { margin-left: auto; font-size: 14px; font-weight: 600; color: ${t.muted}; letter-spacing: 0.01em; }
	</style></head><body>
		<div class="window">
			<div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="url">${escape(shot.url)}</div></div>
			<div class="view"><img src="data:image/png;base64,${shot.data}" width="${shot.width}" height="${shot.height}"></div>
		</div>
		<div class="caption"><span class="step">${step}</span><span class="text">${escape(caption)}</span><span class="brand">Workblock</span></div>
	</body></html>`;
}

async function record(theme, frames) {
	const close = await launch(process.argv[2]);
	try {
		const { ext, extBase } = await connectWorker();
		const tabUrl = (id) => ext.evaluate(`chrome.tabs.get(${id}).then(t => t.url)`);

		async function open(url) {
			const before = new Set((await targets()).map((t) => t.id));
			const id = await ext.evaluate(`chrome.tabs.create({ url: "about:blank" }).then(t => t.id)`);
			const target = await waitFor("a new tab", async () => (await targets()).find((t) => t.type === "page" && !before.has(t.id)));
			const page = await connect(target.webSocketDebuggerUrl);
			await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
			await page.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
			await page.send("Emulation.setScrollbarsHidden", { hidden: true });
			await page.send("Page.navigate", { url });
			return {
				page,
				until: (what, expression) => waitFor(what, () => page.evaluate(expression)),
				async shoot(size = VIEWPORT) {
					await page.send("Page.bringToFront");
					await page.send("Emulation.setDeviceMetricsOverride", { ...size, deviceScaleFactor: 1, mobile: false });
					await page.evaluate(`document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`);
					const { data } = await page.send("Page.captureScreenshot", { format: "png" });
					return { ...size, data, url: await tabUrl(id) };
				},
			};
		}

		const s = {
			extBase,
			setCfg: (cfg) => ext.evaluate(`chrome.storage.sync.set(${JSON.stringify(cfg)})`),
			ruleCount: () => ext.evaluate(`chrome.declarativeNetRequest.getDynamicRules().then(r => r.length)`),
			open,
		};
		const stage = await open("about:blank");
		await stage.page.send("Emulation.setDeviceMetricsOverride", { ...STAGE, deviceScaleFactor: 1, mobile: false });
		const { frameTree } = await stage.page.send("Page.getFrameTree");

		const files = [];
		for (const [i, scene] of SCENES.entries()) {
			const shot = await scene.run(s);
			await stage.page.send("Page.bringToFront");
			await stage.page.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html: stageHtml(THEMES[theme], shot, i + 1, scene.caption) });
			await stage.until("the stage to render", `document.images[0]?.decode().then(() => true)`);
			const { data } = await stage.page.send("Page.captureScreenshot", { format: "png" });
			const file = join(frames, `${theme}-${i + 1}-${scene.slug}.png`);
			writeFileSync(file, Buffer.from(data, "base64"));
			files.push(file);
			console.log(`${theme} ${i + 1}/${SCENES.length} ${scene.slug}: ${shot.url}`);
		}
		assert.deepEqual(ext.errors, [], "background script threw nothing");
		return files;
	} finally {
		await close();
	}
}

// The concat demuxer holds each frame for its duration. The last frame is listed
// twice because the final entry's duration is otherwise ignored.
function writeGif(theme, files, frames) {
	const list = join(frames, `${theme}.txt`);
	writeFileSync(list, [...SCENES.map((scene, i) => `file '${files[i]}'\nduration ${scene.hold}`), `file '${files.at(-1)}'`].join("\n") + "\n");
	execFileSync("ffmpeg", [
		"-y", "-loglevel", "error",
		"-f", "concat", "-safe", "0", "-i", list,
		"-vf", "split[a][b];[a]palettegen=stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=none",
		"-fps_mode", "vfr", "-loop", "0",
		join(DOCS, `demo-${theme}.gif`),
	]);
}

const frames = mkdtempSync(join(tmpdir(), "workblock-demo-"));
rmSync(SCREENSHOTS, { recursive: true, force: true });
mkdirSync(SCREENSHOTS, { recursive: true });

for (const theme of Object.keys(THEMES)) {
	const files = await record(theme, frames);
	writeGif(theme, files, frames);
	if (theme === "light") {
		for (const [i, file] of files.entries()) {
			execFileSync("magick", [file, "-alpha", "off", `PNG24:${join(SCREENSHOTS, `${i + 1}-${SCENES[i].slug}.png`)}`]);
		}
	}
}
console.log(`frames in ${frames}`);
