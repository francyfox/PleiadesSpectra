import { describe, expect, test } from "bun:test";
import { classifyCameraError, isCameraBusyError } from "./camera-error";
import { openWhenFree } from "./camera-retry";

const domError = (name: string, message = "") =>
	new DOMException(message, name);

describe("classifyCameraError", () => {
	test("a refused permission is a permission failure", () => {
		expect(classifyCameraError(domError("NotAllowedError")).reason).toBe(
			"permission",
		);
		expect(classifyCameraError(domError("SecurityError")).reason).toBe(
			"permission",
		);
	});

	test("a busy camera says so and keeps the name of the error", () => {
		const failure = classifyCameraError(
			domError("NotReadableError", "Could not start video source"),
		);
		expect(failure.reason).toBe("camera");
		expect(failure.message).toContain("busy");
		expect(failure.message).toContain("NotReadableError");
		expect(failure.message).toContain("Could not start video source");
	});

	test("a missing camera says so", () => {
		expect(classifyCameraError(domError("NotFoundError")).message).toContain(
			"No camera was found",
		);
	});

	test("anything else is not available, with its name", () => {
		expect(
			classifyCameraError(domError("OverconstrainedError")).message,
		).toContain("OverconstrainedError");
		expect(classifyCameraError("boom").reason).toBe("camera");
	});

	test("only a busy error is worth another try", () => {
		expect(isCameraBusyError(domError("NotReadableError"))).toBe(true);
		expect(isCameraBusyError(domError("NotAllowedError"))).toBe(false);
		expect(isCameraBusyError(new Error("x"))).toBe(false);
	});
});

describe("openWhenFree", () => {
	test("tries again while the camera is busy and returns the stream once it is free", async () => {
		let calls = 0;
		const waits: number[] = [];
		const opened = await openWhenFree(
			async () => {
				calls += 1;
				if (calls < 3) throw domError("NotReadableError");
				return "stream";
			},
			async (ms) => {
				waits.push(ms);
			},
		);
		expect(opened).toBe("stream");
		expect(calls).toBe(3);
		expect(waits).toHaveLength(2);
	});

	test("gives up with the busy error after a few tries", async () => {
		let calls = 0;
		const failing = openWhenFree(
			async () => {
				calls += 1;
				throw domError("NotReadableError");
			},
			async () => {},
		);
		await expect(failing).rejects.toMatchObject({ name: "NotReadableError" });
		expect(calls).toBe(4);
	});

	test("does not try again for a refused permission", async () => {
		let calls = 0;
		const failing = openWhenFree(
			async () => {
				calls += 1;
				throw domError("NotAllowedError");
			},
			async () => {},
		);
		await expect(failing).rejects.toMatchObject({ name: "NotAllowedError" });
		expect(calls).toBe(1);
	});
});
