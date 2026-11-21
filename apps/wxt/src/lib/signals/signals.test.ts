import { describe, expect, test } from "bun:test";
import type { SignalName, SignalSample } from "@repo/protocol";
import { withSessionParams } from "../camera/session-params";
import type { InstalledPlugin } from "../plugins/types";
import { createSignalService } from "./signals.service";
import {
	matchesUrl,
	PHYSIOLOGICAL_NOTE,
	physiologicalNote,
	signalLabels,
	signalsForUrl,
	signalsOfEnabledPlugins,
} from "./signals.utils";

function plugin(
	name: string,
	signals: SignalName[],
	matches: string[] = ["*://*/*"],
	enabled = true,
): InstalledPlugin {
	return {
		id: name,
		source: "",
		enabled,
		header: {
			name,
			author: null,
			matches,
			camera: "always",
			gestures: [],
			signals,
		},
	};
}

const sample: SignalSample = {
	signal: "pose",
	value: { yaw: 0.1, pitch: 0 },
	at: 1,
};

describe("match patterns", () => {
	test("hosts, subdomains, paths and schemes", () => {
		expect(matchesUrl("*://*/*", "https://a.com/x")).toBe(true);
		expect(
			matchesUrl("*://shop.example.com/*", "https://shop.example.com/"),
		).toBe(true);
		expect(matchesUrl("*://shop.example.com/*", "https://example.com/")).toBe(
			false,
		);
		expect(matchesUrl("*://*.example.com/*", "https://a.b.example.com/p")).toBe(
			true,
		);
		expect(matchesUrl("*://*.example.com/*", "https://evilexample.com/p")).toBe(
			false,
		);
		expect(matchesUrl("https://a.com/doc/*", "http://a.com/doc/1")).toBe(false);
		expect(matchesUrl("*://localhost/*", "http://localhost:4010/blog")).toBe(
			true,
		);
		expect(matchesUrl("*://localhost/*", "http://localhost.evil.com/")).toBe(
			false,
		);
		expect(matchesUrl("<all_urls>", "https://a.com/")).toBe(true);
	});
});

describe("signal sets", () => {
	test("session set is the union of enabled scripts in canonical order", () => {
		const plugins = [
			plugin("a", ["pulse", "blink"]),
			plugin("b", ["blink", "pose"]),
			plugin("off", ["breathing"], ["*://*/*"], false),
		];
		expect(signalsOfEnabledPlugins(plugins)).toEqual([
			"blink",
			"pose",
			"pulse",
		]);
		expect(signalsOfEnabledPlugins([plugin("x", [])])).toEqual([]);
	});

	test("a page gets only the signals of scripts matching it", () => {
		const plugins = [
			plugin("shop", ["pulse"], ["*://shop.example.com/*"]),
			plugin("all", ["blink"]),
		];
		expect(signalsForUrl(plugins, "https://shop.example.com/a")).toEqual([
			"blink",
			"pulse",
		]);
		expect(signalsForUrl(plugins, "https://other.com/")).toEqual(["blink"]);
	});
});

describe("install window text", () => {
	test("labels and the physiological note", () => {
		expect(
			signalLabels(["blink", "pose", "expression", "pulse", "breathing"]),
		).toEqual(["Blinks", "Head pose", "Expressions", "Pulse", "Breathing"]);
		expect(physiologicalNote(["pose"])).toBe("");
		expect(physiologicalNote(["blink", "breathing"])).toBe(PHYSIOLOGICAL_NOTE);
		expect(PHYSIOLOGICAL_NOTE).toContain("not a medical reading");
	});
});

describe("camera page address", () => {
	test("carries debug and signals, nothing when empty", () => {
		const off = {
			isDebug: () => false,
			signals: () => [],
			wantsMask: () => false,
		};
		expect(withSessionParams("x.html", off)).toBe("x.html");
		expect(
			withSessionParams("x.html", {
				isDebug: () => true,
				signals: () => ["pose", "pulse"],
				wantsMask: () => false,
			}),
		).toBe("x.html?debug=1&signals=pose%2Cpulse");
	});
});

function harness(initial: InstalledPlugin[]) {
	let plugins = initial;
	let running = true;
	let isAlways = true;
	let isBusy = false;
	let restarts = 0;
	let tabListings = 0;
	const sent: Array<[number, string]> = [];
	const timers: Array<() => void> = [];
	const service = createSignalService({
		listPlugins: async () => plugins,
		listTabs: async () => {
			tabListings += 1;
			return [
				{ id: 1, url: "https://shop.example.com/" },
				{ id: 2, url: "https://other.com/" },
			];
		},
		sendToTab: (tabId, delivered) => sent.push([tabId, delivered.signal]),
		isCameraRunning: () => running,
		isAlwaysHolding: () => isAlways,
		isBusy: () => isBusy,
		restartCamera: async () => {
			restarts += 1;
			service.signalsForNewSession();
		},
		setTimer: (callback) => timers.push(callback) - 1,
		clearTimer: (handle) => {
			timers[handle as number] = () => {};
		},
	});
	return {
		service,
		sent,
		restarts: () => restarts,
		tabListings: () => tabListings,
		setPlugins: (next: InstalledPlugin[]) => {
			plugins = next;
		},
		setRunning: (value: boolean) => {
			running = value;
		},
		setAlwaysHolding: (value: boolean) => {
			isAlways = value;
		},
		setBusy: (value: boolean) => {
			isBusy = value;
		},
		fireTimers: () => {
			for (const timer of timers.splice(0)) timer();
		},
	};
}

describe("session restart", () => {
	test("restarts once, after the debounce, when the set changes", async () => {
		const h = harness([plugin("a", ["blink"])]);
		await h.service.refresh();
		h.service.signalsForNewSession();
		h.setPlugins([plugin("a", ["blink"]), plugin("b", ["pose"])]);
		await h.service.refresh();
		await h.service.refresh();
		expect(h.restarts()).toBe(0);
		h.fireTimers();
		expect(h.restarts()).toBe(1);
	});

	test("no restart when the set is the same, the change is undone, or the camera is off", async () => {
		const h = harness([plugin("a", ["blink"])]);
		await h.service.refresh();
		h.service.signalsForNewSession();
		h.setPlugins([plugin("a", ["blink"]), plugin("b", ["pose"])]);
		await h.service.refresh();
		h.setPlugins([plugin("a", ["blink"])]);
		await h.service.refresh();
		h.fireTimers();
		expect(h.restarts()).toBe(0);

		h.setRunning(false);
		h.setPlugins([plugin("c", ["pulse"])]);
		await h.service.refresh();
		h.fireTimers();
		expect(h.restarts()).toBe(0);
		expect(h.service.signalsForNewSession()).toEqual(["pulse"]);
	});
});

describe("signals belong to the always owner", () => {
	test("a session that the always owner does not hold is opened without signals", async () => {
		const h = harness([plugin("a", ["pose", "pulse"])]);
		await h.service.refresh();
		h.setAlwaysHolding(false);

		expect(h.service.signalsForNewSession()).toEqual([]);

		h.setAlwaysHolding(true);
		expect(h.service.signalsForNewSession()).toEqual(["pose", "pulse"]);
	});

	test("a script with signals does not restart a camera that only a question or a check uses", async () => {
		const h = harness([plugin("a", ["pose"])]);
		h.setAlwaysHolding(false);
		h.service.signalsForNewSession();
		await h.service.refresh();
		h.fireTimers();

		expect(h.restarts()).toBe(0);
	});

	test("the camera is restarted for new signals only when no question is open and no check runs", async () => {
		const h = harness([plugin("a", ["pose"])]);
		h.service.signalsForNewSession();
		h.setPlugins([plugin("a", ["pose"]), plugin("b", ["pulse"])]);
		h.setBusy(true);
		await h.service.refresh();

		h.fireTimers();
		expect(h.restarts()).toBe(0);

		h.setBusy(false);
		h.fireTimers();
		await Promise.resolve();
		expect(h.restarts()).toBe(1);
	});

	test("nothing is delivered while the always owner does not hold the camera", async () => {
		const h = harness([plugin("a", ["pose"])]);
		await h.service.refresh();
		h.setAlwaysHolding(false);

		await h.service.deliver(sample);

		expect(h.sent).toEqual([]);
	});
});

describe("delivery", () => {
	test("only to tabs whose scripts declared the signal", async () => {
		const h = harness([
			plugin("shop", ["pose"], ["*://shop.example.com/*"]),
			plugin("other", ["blink"], ["*://other.com/*"]),
		]);
		await h.service.refresh();
		await h.service.deliver(sample);
		expect(h.sent).toEqual([[1, "pose"]]);
	});

	test("the list of tabs is read once for a burst of samples, and again after the cache expires", async () => {
		const h = harness([plugin("a", ["pose"])]);
		await h.service.refresh();

		for (let index = 0; index < 20; index++) await h.service.deliver(sample);
		const duringBurst = h.tabListings();
		h.fireTimers();
		await h.service.deliver(sample);

		expect(duringBurst).toBe(1);
		expect(h.tabListings()).toBe(2);
	});

	test("nothing when no script asked for the signal", async () => {
		const h = harness([plugin("a", ["blink"])]);
		await h.service.refresh();
		await h.service.deliver(sample);
		expect(h.sent).toEqual([]);
	});
});
