import { resolve } from "node:path";
import { expect, test } from "./extension";

const PLUGIN_FILE = resolve(
	import.meta.dirname,
	"../../../example/scripts/heart-rate.js",
);

async function installHeartRate(
	extension: Parameters<Parameters<typeof test>[2]>[0]["extension"],
) {
	const plugins = await extension.openPage("options.html");
	await plugins.setInputFiles("#plugin-file-input", PLUGIN_FILE);
	await expect(
		plugins.getByRole("heading", { name: "Heart rate" }),
	).toBeVisible();
	await plugins.getByRole("button", { name: "Install" }).click();
	await expect(
		plugins.locator(".plugin strong", { hasText: "Heart rate" }),
	).toBeVisible();
	return plugins;
}

test("the chips of a script stay on one line, and a +N chip counts the ones that do not fit", async ({
	extension,
}) => {
	const plugins = await installHeartRate(extension);
	try {
		await checkChipLine(plugins);
	} finally {
		await deleteHeartRate(plugins);
	}
});

async function checkChipLine(
	plugins: Awaited<ReturnType<typeof installHeartRate>>,
) {
	const row = plugins.locator(".plugin__chips").first();
	const more = row.locator(".plugin__chips-more");
	const lineHeight = (await row.locator(".ui-chip").first().boundingBox())
		?.height;

	await expect(more).toBeHidden();
	await expect
		.poll(async () => (await row.boundingBox())?.height)
		.toBeLessThanOrEqual((lineHeight ?? 0) + 2);

	await row.evaluate((element) => {
		(element as HTMLElement).style.width = "230px";
	});

	await expect(more).toBeVisible();
	await expect(more).toHaveText(/^\+\d+$/);
	await expect(row.locator(".ui-chip:visible").first()).toBeVisible();
	await expect
		.poll(async () => (await row.boundingBox())?.height)
		.toBeLessThanOrEqual((lineHeight ?? 0) + 2);
}

/** The profile of the browser is shared by the tests, so a script that a test installed is deleted again. */
async function deleteHeartRate(
	plugins: Awaited<ReturnType<typeof installHeartRate>>,
) {
	await plugins
		.locator('.plugin:has-text("Heart rate") [data-action="delete"]')
		.first()
		.click();
	await expect(
		plugins.locator(".plugin strong", { hasText: "Heart rate" }),
	).toHaveCount(0);
}

async function popupCounts(
	popup: Awaited<ReturnType<typeof installHeartRate>>,
) {
	const numbers = popup.locator(".popup__plugins .popup__count > span");
	await expect(numbers).toHaveCount(2);
	return {
		active: Number(await numbers.nth(0).textContent()),
		disabled: Number(await numbers.nth(1).textContent()),
	};
}

test("the popup counts the active and the disabled scripts on its button, and says nothing about a camera that is off", async ({
	extension,
}) => {
	const plugins = await installHeartRate(extension);
	const before = await popupCounts(await extension.openPage("popup.html"));
	expect(before.active).toBeGreaterThanOrEqual(1);

	await plugins
		.locator('.plugin:has-text("Heart rate") [data-action="toggle"]')
		.first()
		.click();
	await plugins.waitForTimeout(300);

	const popup = await extension.openPage("popup.html");
	const after = await popupCounts(popup);
	expect(after.active).toBe(before.active - 1);
	expect(after.disabled).toBe(before.disabled + 1);
	await expect(popup.getByText("Off", { exact: true })).toHaveCount(0);
	await expect(
		popup.locator(".ui-chip", { hasText: "Heart rate" }),
	).toHaveCount(0);
	await deleteHeartRate(plugins);
});

type CameraSituation = "prompt" | "granted-but-no-picture" | "granted";

/** Opens the popup as the browser would show it when the camera is in the given situation. */
async function openPopupWithCamera(
	extension: Parameters<Parameters<typeof test>[2]>[0]["extension"],
	situation: CameraSituation,
) {
	const popup = await extension.context.newPage();
	const errors: string[] = [];
	popup.on("pageerror", (error) => errors.push(error.message));
	await popup.addInitScript((mode) => {
		if (mode === "prompt")
			navigator.permissions.query = (async () => ({
				state: "prompt",
			})) as never;
		if (mode === "granted-but-no-picture") {
			navigator.permissions.query = (async () => ({
				state: "granted",
			})) as never;
			navigator.mediaDevices.getUserMedia = (async () => {
				throw new DOMException("busy", "NotReadableError");
			}) as never;
		}
	}, situation);
	await popup.goto(`chrome-extension://${extension.id}/popup.html`);
	await popup.waitForTimeout(1500);
	return { popup, errors };
}

for (const situation of ["prompt", "granted-but-no-picture"] as const) {
	test(`the popup offers Allow camera when the camera cannot be used (${situation})`, async ({
		extension,
	}) => {
		const { popup, errors } = await openPopupWithCamera(extension, situation);

		await expect(
			popup.getByRole("button", { name: "Allow camera" }),
		).toBeVisible();
		await expect(popup.getByText("Off", { exact: true })).toHaveCount(0);
		expect(errors).toEqual([]);
	});
}

test("the popup does not ask for the camera while the picture works", async ({
	extension,
}) => {
	const { popup, errors } = await openPopupWithCamera(extension, "granted");

	await expect(
		popup.getByRole("button", { name: "Allow camera" }),
	).toBeHidden();
	await expect(popup.getByText("Preview only: nothing is sent")).toBeVisible();
	expect(errors).toEqual([]);
});

test("the popup says why the camera did not open", async ({ extension }) => {
	const { popup } = await openPopupWithCamera(
		extension,
		"granted-but-no-picture",
	);

	await expect(popup.getByText(/camera is busy/i)).toBeVisible();
	await expect(popup.getByText(/NotReadableError/)).toBeVisible();
	await expect(
		popup.getByRole("button", { name: "Allow camera" }),
	).toBeVisible();
});

test("a camera that is busy for a moment is opened after a short wait", async ({
	extension,
}) => {
	const popup = await extension.context.newPage();
	await popup.addInitScript(() => {
		const open = navigator.mediaDevices.getUserMedia.bind(
			navigator.mediaDevices,
		);
		let refusals = 2;
		navigator.mediaDevices.getUserMedia = async (constraints) => {
			if (refusals-- > 0) throw new DOMException("busy", "NotReadableError");
			return open(constraints);
		};
	});
	await popup.goto(`chrome-extension://${extension.id}/popup.html`);

	await expect(popup.getByText("Preview only: nothing is sent")).toBeVisible({
		timeout: 10_000,
	});
	await expect(
		popup.getByRole("button", { name: "Allow camera" }),
	).toBeHidden();
});

test("the main switch of the popup drops every script from the pages and brings them back", async ({
	extension,
}) => {
	const popup = await extension.openPage("popup.html");
	const main = popup.getByRole("switch", { name: "Scripts" });
	const registered = () =>
		popup.evaluate(async () => {
			const scripts = await (
				globalThis as unknown as {
					chrome: { userScripts: { getScripts(): Promise<unknown[]> } };
				}
			).chrome.userScripts.getScripts();
			return scripts.length;
		});
	try {
		await expect(main).toHaveAttribute("aria-checked", "true");
		await main.click();
		await expect(main).toHaveAttribute("aria-checked", "false");
		await expect.poll(registered).toBe(0);
	} finally {
		if ((await main.getAttribute("aria-checked")) === "false")
			await main.click();
	}
	await expect(main).toHaveAttribute("aria-checked", "true");
});

test("the popup shows how many frames per second the camera gives", async ({
	extension,
}) => {
	const { popup, errors } = await openPopupWithCamera(extension, "granted");

	await expect(popup.locator(".popup__fps")).toHaveText(/^\d+ fps$/, {
		timeout: 10_000,
	});
	expect(errors).toEqual([]);
});
