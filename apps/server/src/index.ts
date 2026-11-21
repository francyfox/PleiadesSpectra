import { Elysia } from "elysia";
import logixlysia from "logixlysia";
import { agentRoutes } from "#modules/agent/agent-routes";
import { config } from "#modules/config/config";
import { docsPlugin } from "#modules/docs/docs";
import { docsAnnouncement } from "#modules/docs/docs.utils";
import { healthRoutes } from "#modules/health/health-routes";
import { streamRoutes } from "#modules/stream/stream-routes";
import { IS_PRODUCTION } from "./consts";

new Elysia()
	.use(
		logixlysia({
			preset: IS_PRODUCTION ? "prod" : "dev",
			config: {
				autoRedact: true,
				showStartupMessage: true,
			},
		}),
	)
	.use(docsPlugin)
	.use(healthRoutes)
	.use(streamRoutes)
	.use(agentRoutes)
	.listen({ port: config.PORT, hostname: config.HOST }, ({ url }) => {
		console.log(docsAnnouncement(url.origin));
	});
