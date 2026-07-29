// Self-check for the pure scheduling logic: node test.mjs
import assert from "node:assert/strict";
import { DEFAULTS, buildRules, isWorkHours, parseSites } from "./schedule.js";

const at = (day, hour) => new Date(2026, 6, 26 + day, hour, 30); // Jul 26 2026 is a Sunday

// window boundaries, Wednesday
assert.equal(isWorkHours(DEFAULTS, at(3, 9)), true, "09:30 Wed blocks");
assert.equal(isWorkHours(DEFAULTS, at(3, 16)), true, "16:30 Wed blocks");
assert.equal(isWorkHours(DEFAULTS, at(3, 8)), false, "08:30 Wed is before start");
assert.equal(isWorkHours(DEFAULTS, at(3, 17)), false, "17:30 Wed is past end");
assert.equal(isWorkHours(DEFAULTS, at(3, 0)), false, "midnight is free");

// weekends are off regardless of hour
assert.equal(isWorkHours(DEFAULTS, at(6, 10)), false, "Saturday is free");
assert.equal(isWorkHours(DEFAULTS, at(0, 10)), false, "Sunday is free");
assert.equal(isWorkHours(DEFAULTS, at(1, 10)), true, "Monday blocks");
assert.equal(isWorkHours(DEFAULTS, at(5, 10)), true, "Friday blocks");

// a night-shift window (start > end) is NOT supported - assert the known ceiling
assert.equal(isWorkHours({ ...DEFAULTS, startHour: 22, endHour: 2 }, at(3, 23)), false, "wrapping window unsupported");

// rule shape must match what declarativeNetRequest expects
const rules = buildRules(["x.com", "reddit.com"]);
assert.equal(rules.length, 2);
assert.deepEqual(new Set(rules.map((r) => r.id)), new Set([1, 2]), "ids unique and 1-based");
assert.equal(rules[0].action.type, "block");
assert.deepEqual(rules[0].condition.requestDomains, ["x.com"]);
assert.deepEqual(rules[0].condition.resourceTypes, ["main_frame"], "only block navigations");
assert.deepEqual(buildRules([]), [], "empty site list yields no rules");

// pasted URLs get normalised down to a bare domain
assert.deepEqual(parseSites("https://www.x.com/home\n\n# a comment\n  reddit.com  \n"), ["x.com", "reddit.com"]);
assert.deepEqual(parseSites(""), [], "empty input is not a rule for everything");

console.log("ok - all checks passed");
