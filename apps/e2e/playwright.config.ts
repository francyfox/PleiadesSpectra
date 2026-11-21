import { defineConfig } from "@playwright/test";
import { DEMO_URL } from "./demo-url";

export default defineConfig({
	testDir: "./tests",
	timeout: 90_000,
	workers: 1,
	reporter: "list",
	webServer: [
		{
			command: "bun run src/index.ts",
			cwd: "../demo",
			url: DEMO_URL,
			reuseExistingServer: true,
		},
		/** The local Spectra server: the extension asks it whether it is online before it opens the camera. */
		{
			command: "bun run src/index.ts",
			cwd: "../server",
			url: "http://localhost:3001/health",
			reuseExistingServer: true,
		},
	],
	use: {
		baseURL: DEMO_URL,
		/** The Chrome that is installed: no browser download. */
		channel: "chrome",
		headless: true,
	},
});
