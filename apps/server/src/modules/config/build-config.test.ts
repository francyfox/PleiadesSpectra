import { describe, expect, test } from "bun:test";
import { buildConfig } from "./build-config";

describe("SMARTSPECTRA_TELEMETRY", () => {
	test("is off when the variable is not set or empty", () => {
		expect(buildConfig({}).SMARTSPECTRA_TELEMETRY).toBe(false);
		expect(
			buildConfig({ SMARTSPECTRA_TELEMETRY: "" }).SMARTSPECTRA_TELEMETRY,
		).toBe(false);
	});

	test("turns on only by an explicit true", () => {
		expect(
			buildConfig({ SMARTSPECTRA_TELEMETRY: "true" }).SMARTSPECTRA_TELEMETRY,
		).toBe(true);
		expect(
			buildConfig({ SMARTSPECTRA_TELEMETRY: "false" }).SMARTSPECTRA_TELEMETRY,
		).toBe(false);
	});

	test("rejects a value that is not a boolean", () => {
		expect(() => buildConfig({ SMARTSPECTRA_TELEMETRY: "maybe" })).toThrow();
	});
});

describe("HOST", () => {
	test("is loopback unless it is set", () => {
		expect(buildConfig({}).HOST).toBe("127.0.0.1");
		expect(buildConfig({ HOST: "0.0.0.0" }).HOST).toBe("0.0.0.0");
	});
});
