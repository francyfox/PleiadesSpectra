import { Elysia, t } from "elysia";

/** Plain answer of the liveness check. */
export const HEALTH_ANSWER = "ok";

/** `GET /health`: lets the extension, a process supervisor or a CI step check that the local server is up. */
export const healthRoutes = new Elysia().get("/health", () => HEALTH_ANSWER, {
	response: t.String({
		description: "Always `ok` while the server is running.",
		examples: [HEALTH_ANSWER],
	}),
	detail: {
		tags: ["system"],
		summary: "Health check",
		description:
			"Returns the plain text `ok` with status 200 as long as the server process is running. It does not check the camera, the SmartSpectra SDK or a connected extension.",
	},
});
