import { buildConfig } from "./build-config";

export { buildConfig, type ServerConfig } from "./build-config";

/** The configuration of this process, read from the environment once, when the module is first imported. */
export const config = buildConfig(process.env);
