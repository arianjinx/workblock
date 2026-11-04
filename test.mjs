import assert from "node:assert/strict";
import { DEFAULTS, blockedPageUrl, buildRules, hostMatches, isValidWindow, isWorkHours, parseSites, webReturnUrl } from "./schedule.js";

const SUNDAY = new Date(2026, 6, 26);
const at = (day, hour) => new Date(SUNDAY.getFullYear(), SUNDAY.getMonth(), SUNDAY.getDate() + day, hour, 30);
assert.equal(at(0, 10).getDay(), 0, "day 0 is a Sunday");

assert.equal(isWorkHours(DEFAULTS, at(3, 9)), true, "09:30 Wed blocks");
assert.equal(isWorkHours(DEFAULTS, at(3, 16)), true, "16:30 Wed blocks");
assert.equal(isWorkHours(DEFAULTS, at(3, 8)), false, "08:30 Wed is before start");
assert.equal(isWorkHours(DEFAULTS, at(3, 17)), false, "17:30 Wed is past end");
assert.equal(isWorkHours(DEFAULTS, at(3, 0)), false, "midnight is free");

assert.equal(isWorkHours(DEFAULTS, at(6, 10)), false, "Saturday is free");
assert.equal(isWorkHours(DEFAULTS, at(0, 10)), false, "Sunday is free");
assert.equal(isWorkHours(DEFAULTS, at(1, 10)), true, "Monday blocks");
assert.equal(isWorkHours(DEFAULTS, at(5, 10)), true, "Friday blocks");

assert.equal(isValidWindow(DEFAULTS), true, "the default window is valid");
assert.equal(isValidWindow({ startHour: 22, endHour: 2 }), false, "a window that wraps past midnight is rejected");
assert.equal(isValidWindow({ startHour: 9, endHour: 9 }), false, "an empty window is rejected");

const rules = buildRules(["x.com", "reddit.com"]);
assert.equal(rules.length, 2);
assert.deepEqual(new Set(rules.map((r) => r.id)), new Set([1, 2]), "ids unique and 1-based");
assert.equal(rules[0].action.type, "block");
assert.deepEqual(rules[0].condition.requestDomains, ["x.com"]);
assert.deepEqual(rules[0].condition.resourceTypes, ["main_frame"], "only block navigations");
assert.deepEqual(buildRules([]), [], "empty site list yields no rules");

assert.deepEqual(parseSites("https://www.x.com/home\n\n# a comment\n  reddit.com  \n"), ["x.com", "reddit.com"]);
assert.deepEqual(parseSites("HTTPS://WWW.Example.COM/Path\nReddit.com"), ["example.com", "reddit.com"], "site names are lowercased");
assert.deepEqual(parseSites(""), [], "empty input is not a rule for everything");

const list = ["youtube.com", "x.com"];
assert.equal(hostMatches("https://www.youtube.com/watch?v=abc", list), true, "subdomain matches");
assert.equal(hostMatches("https://youtube.com/", list), true, "bare domain matches");
assert.equal(hostMatches("https://notyoutube.com/", list), false, "suffix must land on a dot boundary");
assert.equal(hostMatches("https://youtube.com.evil.test/", list), false, "domain must be the actual host");
assert.equal(hostMatches("chrome-extension://abc/blocked.html", list), false, "never bounce our own page");
assert.equal(hostMatches("about:blank", list), false, "non-http URLs are not matches");
assert.equal(hostMatches("https://www.example.com/", ["Example.com"]), true, "a site saved with capitals still matches");
assert.deepEqual(buildRules(["Example.com"])[0].condition.requestDomains, ["example.com"], "rules use lowercase domains");
assert.equal(hostMatches("", list), false, "unparseable URL is not a match");

const original = "https://www.youtube.com/watch?v=abc&t=42s#comments";
const page = blockedPageUrl("chrome-extension://id/blocked.html", original);
assert.equal(webReturnUrl(new URL(page).search), original, "original URL survives the round trip");
assert.equal(webReturnUrl(""), null, "a bare blocked page has nowhere to return to");
assert.equal(webReturnUrl("?url=javascript%3Aalert(1)"), null, "never return to a javascript: URL");
assert.equal(webReturnUrl("?url=chrome-extension%3A%2F%2Fid%2Fblocked.html"), null, "never return to an extension page");

console.log("ok - all checks passed");
