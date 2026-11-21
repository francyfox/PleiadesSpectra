import { config } from "#modules/config/config";

export const IS_PRODUCTION = config.MODE === "production";
