import { expect, test } from "bun:test";
import { withSessionParams } from "./session-params";

const options = (wantsMask: boolean) => ({
	isDebug: () => false,
	signals: () => [],
	wantsMask: () => wantsMask,
});

test("the mask is asked for in the address only while the popup shows it", () => {
	expect(withSessionParams("/camera.html", options(true))).toBe(
		"/camera.html?mask=1",
	);
	expect(withSessionParams("/camera.html", options(false))).toBe(
		"/camera.html",
	);
});
