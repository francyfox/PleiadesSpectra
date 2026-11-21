import { expect, test } from "bun:test";
import { parseServerMessage } from "./parse-server-message";

test("a mask message with flat points is accepted", () => {
	const text = JSON.stringify({
		type: "mask",
		width: 640,
		height: 480,
		points: [1, 2, 3, 4],
	});

	expect(parseServerMessage(text)).toEqual({
		type: "mask",
		width: 640,
		height: 480,
		points: [1, 2, 3, 4],
	});
});

test("a mask message with a size or points of the wrong kind is dropped", () => {
	const bad = [
		{ type: "mask", width: "640", height: 480, points: [] },
		{ type: "mask", width: 640, height: 480, points: "1,2" },
		{ type: "mask", width: 640, height: 480, points: [1, "2"] },
	];

	for (const message of bad)
		expect(parseServerMessage(JSON.stringify(message))).toBeNull();
});
