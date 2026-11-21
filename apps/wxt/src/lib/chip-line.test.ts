import { describe, expect, test } from "bun:test";
import { visibleChipCount } from "./chip-line";

const more = () => 30;

describe("visibleChipCount", () => {
	test("keeps all chips when they fit in the line", () => {
		expect(visibleChipCount([50, 50, 50], 170, 10, more)).toBe(3);
		expect(visibleChipCount([], 100, 10, more)).toBe(0);
	});

	test("leaves chips out, with room for the +N chip, when they do not fit", () => {
		// 3 chips of 50 and gaps of 10 need 170; at 150 only two chips and the "+1" (30) fit: 50+10+50+10+30 = 150
		expect(visibleChipCount([50, 50, 50], 150, 10, more)).toBe(2);
		expect(visibleChipCount([50, 50, 50], 149, 10, more)).toBe(1);
	});

	test("the +N chip may be wider with more chips left out", () => {
		const wider = (hidden: number) => 10 + hidden * 10;
		expect(visibleChipCount([40, 40, 40, 40], 120, 10, wider)).toBe(1);
	});

	test("when not even one chip fits with the +N chip, only the +N chip stays", () => {
		expect(visibleChipCount([100, 100], 60, 10, more)).toBe(0);
	});
});
