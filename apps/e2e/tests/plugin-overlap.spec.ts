import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./extension";

interface OverlapPlugin {
	name: string;
	match: string;
	gestures: string;
}

const ALPHA: OverlapPlugin = {
	name: "Overlap Alpha",
	match: "*://*.overlap-test.example/*",
	gestures: "nod, shake",
};
const BETA: OverlapPlugin = {
	name: "Overlap Beta",
	match: "*://shop.overlap-test.example/cart*",
	gestures: "nod",
};
const GAMMA: OverlapPlugin = {
	name: "Overlap Gamma",
	match: "*://other-site.example/*",
	gestures: "nod",
};

function pluginSource({ name, match, gestures }: OverlapPlugin): string {
	return `// ==Reaction==
// @name      ${name}
// @match     ${match}
// @gestures  ${gestures}
// ==/Reaction==

reaction("${name.toLowerCase().replace(/\W+/g, "-")}").onVisible("#nothing", () => {});
`;
}

function writePluginFile(plugin: OverlapPlugin): string {
	const directory = mkdtempSync(join(tmpdir(), "overlap-"));
	mkdirSync(directory, { recursive: true });
	const file = join(directory, `${plugin.name.replace(/\W+/g, "-")}.js`);
	writeFileSync(file, pluginSource(plugin));
	return file;
}

function card(plugins: Page, plugin: OverlapPlugin) {
	return plugins.locator(".plugin").filter({
		has: plugins.locator("strong", { hasText: plugin.name }),
	});
}

async function install(plugins: Page, plugin: OverlapPlugin) {
	await plugins.setInputFiles("#plugin-file-input", writePluginFile(plugin));
	await expect(
		plugins.getByRole("heading", { name: plugin.name }),
	).toBeVisible();
	return plugins.getByRole("button", { name: "Install" }).click();
}

async function installAndWait(plugins: Page, plugin: OverlapPlugin) {
	await install(plugins, plugin);
	await expect(
		plugins.locator(".plugin strong", { hasText: plugin.name }),
	).toBeVisible();
}

/** The profile of the browser is shared by the tests, so every script installed here is deleted again. */
async function deleteIfPresent(plugins: Page, plugin: OverlapPlugin) {
	const row = card(plugins, plugin);
	if ((await row.count()) === 0) return;
	await row.locator('[data-action="delete"]').click();
	await expect(row).toHaveCount(0);
}

test("scripts that run on the same pages are highlighted with the reason, and switching one off clears it", async ({
	extension,
}) => {
	const plugins = await extension.openPage("options.html");
	try {
		await installAndWait(plugins, ALPHA);
		await installAndWait(plugins, BETA);
		await installAndWait(plugins, GAMMA);

		await expect(card(plugins, ALPHA)).toHaveAttribute("data-overlap", "true");
		await expect(card(plugins, BETA)).toHaveAttribute("data-overlap", "true");
		await expect(card(plugins, ALPHA)).toContainText(
			"Shares pages with: Overlap Beta",
		);
		await expect(card(plugins, BETA)).toContainText(
			"Shares pages with: Overlap Alpha",
		);
		await expect(card(plugins, ALPHA)).toContainText(
			"Both listen for: nod. Both will react.",
		);
		await expect(card(plugins, GAMMA)).toHaveAttribute("data-overlap", "false");
		await expect(card(plugins, GAMMA)).not.toContainText("Shares pages with");

		await card(plugins, BETA).locator('[data-action="toggle"]').click();

		await expect(card(plugins, ALPHA)).toHaveAttribute("data-overlap", "false");
		await expect(card(plugins, ALPHA)).not.toContainText("Shares pages with");
	} finally {
		await deleteIfPresent(plugins, ALPHA);
		await deleteIfPresent(plugins, BETA);
		await deleteIfPresent(plugins, GAMMA);
	}
});

test("the install window says which installed scripts share pages with the new one", async ({
	extension,
}) => {
	const plugins = await extension.openPage("options.html");
	try {
		await installAndWait(plugins, ALPHA);

		await plugins.setInputFiles("#plugin-file-input", writePluginFile(BETA));
		await expect(
			plugins.getByRole("heading", { name: BETA.name }),
		).toBeVisible();
		await expect(
			plugins.getByText(
				"Runs on pages that these scripts also use: Overlap Alpha",
			),
		).toBeVisible();
		await expect(
			plugins.getByText("Both listen for: nod. Both will react.").last(),
		).toBeVisible();
		await plugins.getByRole("button", { name: "Cancel" }).click();
	} finally {
		await deleteIfPresent(plugins, ALPHA);
	}
});
