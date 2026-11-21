import { beforeEach, describe, expect, mock, test } from "bun:test";

interface FakeRegistration {
	id: string;
	matches: string[];
	worldId: string;
	js: Array<{ code: string }>;
}

let storedPlugins: Record<string, unknown> = {};
let registered: FakeRegistration[] = [];

mock.module("wxt/browser", () => ({
	browser: {
		storage: {
			local: {
				get: async (key: string) => ({ [key]: storedPlugins[key] }),
				set: async (values: Record<string, unknown>) => {
					storedPlugins = { ...storedPlugins, ...values };
				},
			},
		},
		userScripts: {
			getScripts: async () => registered,
			unregister: async () => {
				registered = [];
			},
			configureWorld: async () => {},
			register: async (registrations: FakeRegistration[]) => {
				registered = [...registered, ...registrations];
			},
		},
	},
}));

const { prepareInstallPreview } = await import("./install-preview");
const { registerInstalledPlugins } = await import("./register");
const { deletePlugin, savePlugin, setPluginEnabled } = await import("./store");
const { createPluginId } = await import("./plugin-id");

const RATING_SOURCE = `// ==Reaction==
// @name        Service rating
// @match       *://shop.example.com/*
// @camera      on-demand
// @gestures    smile, confused
// ==/Reaction==
reaction("rating");`;

const SCROLL_SOURCE = `// ==Reaction==
// @name        Scroll by tilt
// @match       *://*/*
// @camera      always
// @gestures    tilt-down, tilt-up
// ==/Reaction==
reaction("scroll");`;

/** What pressing "Install" in the dialog does: preview, store, register. */
async function install(fileName: string, source: string) {
	const preview = prepareInstallPreview(fileName, source);
	if (!preview.valid) return preview;

	await savePlugin({
		id: createPluginId(preview.header.name, preview.source),
		source: preview.source,
		header: preview.header,
		enabled: true,
	});
	await registerInstalledPlugins();
	return preview;
}

beforeEach(() => {
	storedPlugins = {};
	registered = [];
});

describe("installing scripts", () => {
	test("a valid script is registered for its sites with the runtime before its code", async () => {
		const preview = await install("rating.js", RATING_SOURCE);

		expect(preview.valid).toBe(true);
		expect(registered).toHaveLength(1);
		const [registration] = registered;
		expect(registration?.matches).toEqual(["*://shop.example.com/*"]);
		expect(registration?.worldId).toBe(registration?.id ?? "");
		expect(registration?.js).toHaveLength(3);
		expect(registration?.js[2]?.code).toBe(RATING_SOURCE);
		expect(registration?.js[0]?.code).toContain("__pleiadesPermissions");
		expect(registration?.js[0]?.code).toContain(
			'"gestures":["smile","confused"]',
		);
	});

	test("a file without a valid header is refused and nothing is stored or registered", async () => {
		const preview = await install("bad.js", "console.log('no header')");

		expect(preview.valid).toBe(false);
		expect(storedPlugins).toEqual({});
		expect(registered).toEqual([]);
	});

	test("an unknown gesture in the header is refused", async () => {
		const preview = await install(
			"bad.js",
			RATING_SOURCE.replace("confused", "wink"),
		);
		expect(preview.valid).toBe(false);
		expect(registered).toEqual([]);
	});

	test("two scripts live in separate worlds", async () => {
		await install("rating.js", RATING_SOURCE);
		await install("scroll.js", SCROLL_SOURCE);

		expect(registered).toHaveLength(2);
		expect(new Set(registered.map((item) => item.worldId)).size).toBe(2);
	});

	test("reinstalling a script with the same name replaces it", async () => {
		await install("rating.js", RATING_SOURCE);
		await install("rating.js", `${RATING_SOURCE}\n// v2`);

		expect(registered).toHaveLength(1);
		expect(registered[0]?.js[2]?.code).toContain("// v2");
	});
});

describe("script lifecycle", () => {
	test("a disabled script is not registered, and enabling brings it back", async () => {
		await install("rating.js", RATING_SOURCE);
		const [{ id }] = registered as [FakeRegistration];

		await setPluginEnabled(id, false);
		await registerInstalledPlugins();
		expect(registered).toEqual([]);

		await setPluginEnabled(id, true);
		await registerInstalledPlugins();
		expect(registered).toHaveLength(1);
	});

	test("deleting a script removes its registration and leaves the others", async () => {
		await install("rating.js", RATING_SOURCE);
		await install("scroll.js", SCROLL_SOURCE);
		const ratingId = registered.find((item) =>
			item.matches.includes("*://shop.example.com/*"),
		)?.id;

		await deletePlugin(ratingId ?? "");
		await registerInstalledPlugins();

		expect(registered).toHaveLength(1);
		expect(registered[0]?.matches).toEqual(["*://*/*"]);
	});
});

describe("scripts stored by an older version", () => {
	test("turns object-shaped matches and gestures back into arrays", async () => {
		const { repairPlugin } = await import("./store");
		const broken = {
			id: "old",
			enabled: true,
			source: "",
			header: {
				name: "Old",
				author: "",
				camera: "on-demand",
				matches: { "0": "*://localhost/*" },
				gestures: { "0": "smile" },
			},
		} as never;
		const { header } = repairPlugin(broken);
		expect(header.matches).toEqual(["*://localhost/*"]);
		expect(header.gestures).toEqual(["smile"]);
	});
});
