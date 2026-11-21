import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function buildConfig(env: Record<string, string | undefined>) {
	return createEnv({
		server: {
			MODE: z.enum(["development", "production"]).default("development"),
			PORT: z.coerce.number().int().positive().default(3001),
			/**
			 * Where the server listens. Only this machine may reach it (the extension, the agent connector and the camera
			 * stream are local), so the default is loopback. In a container the server must listen on `0.0.0.0` to be
			 * reachable through the published port; the port is then published on the loopback of the host only.
			 */
			HOST: z.string().min(1).default("127.0.0.1"),
			SMARTSPECTRA_API_KEY: z.string().min(1).optional(),
			/**
			 * Lets the SmartSpectra SDK send session summaries and readiness reports. Off unless set to `true`:
			 * the SDK itself defaults to on, and this server opts out so nothing leaves the machine by accident.
			 */
			SMARTSPECTRA_TELEMETRY: z.stringbool().default(false),
		},
		runtimeEnv: env,
		emptyStringAsUndefined: true,
	});
}

export type ServerConfig = ReturnType<typeof buildConfig>;
