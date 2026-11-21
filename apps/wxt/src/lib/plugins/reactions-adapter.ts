import runtimeSource from "@repo/reactions/runtime.js?raw";

export { parseHeader } from "@repo/reactions/header";

/** The built IIFE that defines the global `reaction`; it runs before every script's code. */
export const PLUGIN_RUNTIME_SOURCE: string = runtimeSource;
