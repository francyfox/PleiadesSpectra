import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_URL } from "../demo-url";
import { type Extension, expect, test } from "./extension";

const SCRATCH_DIR =
	"/tmp/claude-1000/-home-fox-WebstormProjects-PleiadesSpectra/df5a1e50-0083-49ea-861d-4c47b1fbec8d/scratchpad";

/** A script that listens to both signals and writes what reached it into `document.body.dataset`. */
function pluginSource(name: string, id: string, header: string): string {
	return `// ==Reaction==
// @name        ${name}
// @match       *://localhost/*
${header}
// ==/Reaction==
const record = (signal) => () => {
	document.body.dataset[${JSON.stringify(id)} + "_" + signal] = "1";
};
reaction(${JSON.stringify(id)})
	.onSignal("pose", record("pose"))
	.onSignal("blink", record("blink"));
`;
}

function writePlugin(fileName: string, source: string): string {
	const directory = join(SCRATCH_DIR, "plugin-permissions");
	mkdirSync(directory, { recursive: true });
	const path = join(directory, fileName);
	writeFileSync(path, source);
	return path;
}

async function install(extension: Extension, file: string, title: string) {
	const plugins = await extension.openPage("options.html");
	await plugins.setInputFiles("#plugin-file-input", file);
	await expect(plugins.getByRole("heading", { name: title })).toBeVisible();
	await plugins.getByRole("button", { name: "Install" }).click();
	await expect(
		plugins.locator(".plugin strong", { hasText: title }),
	).toBeVisible();
	await plugins.waitForTimeout(800);
	return plugins;
}

/** The profile is shared by the tests, so what a test installed is put back. */
async function uninstall(
	plugins: Awaited<ReturnType<typeof install>>,
	title: string,
) {
	await plugins
		.locator(`.plugin:has-text("${title}") [data-action="delete"]`)
		.first()
		.click();
	await expect(
		plugins.locator(".plugin strong", { hasText: title }),
	).toHaveCount(0);
}

test("a script gets only the signals it declared, even when another script on the page declared the others", async ({
	extension,
}) => {
	const poseFile = writePlugin(
		"pose-only.js",
		pluginSource(
			"Permissions pose",
			"poseonly",
			"// @camera      always\n// @signals     pose",
		),
	);
	const blinkFile = writePlugin(
		"blink-only.js",
		pluginSource("Permissions blink", "blinkonly", "// @signals     blink"),
	);
	const plugins = await install(extension, poseFile, "Permissions pose");
	await install(extension, blinkFile, "Permissions blink");
	try {
		const blog = await extension.context.newPage();
		const warnings: string[] = [];
		blog.on("console", (message) => {
			if (message.type() === "warning") warnings.push(message.text());
		});
		await blog.goto(`${DEMO_URL}/`);
		await blog.waitForTimeout(1500);

		await blog.evaluate(() => {
			for (const [signal, value] of [
				["blink", { detected: true }],
				["pose", { yaw: 1, pitch: 2, roll: 0 }],
			] as const)
				window.dispatchEvent(
					new CustomEvent("pleiades:signal", {
						detail: JSON.stringify({ signal, value, at: Date.now() }),
					}),
				);
		});

		const received = () => blog.evaluate(() => ({ ...document.body.dataset }));
		await expect
			.poll(received)
			.toMatchObject({ poseonly_pose: "1", blinkonly_blink: "1" });
		const result = await received();
		expect(result.poseonly_blink).toBeUndefined();
		expect(result.blinkonly_pose).toBeUndefined();

		const text = warnings.join("\n");
		expect(text).toContain(
			'signal "blink" is not declared in @signals, so this script does not get it',
		);
		expect(text).toContain(
			'signal "pose" is not declared in @signals, so this script does not get it',
		);
	} finally {
		await uninstall(plugins, "Permissions pose");
		await uninstall(plugins, "Permissions blink");
	}
});
