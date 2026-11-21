import { describe, expect, test } from "bun:test";
import { isHelpTab, promptExamples, reactionTriggers } from "./help.model";

describe("help tabs", () => {
	test("the reactions tab is known, an unknown one is not", () => {
		expect(isHelpTab("reactions")).toBe(true);
		expect(isHelpTab("developer")).toBe(true);
		expect(isHelpTab("nothing")).toBe(false);
	});
});

describe("request examples", () => {
	test("every example has a title and a request, and titles do not repeat", () => {
		const titles = promptExamples.map((example) => example.title);
		expect(new Set(titles).size).toBe(titles.length);
		for (const example of promptExamples) {
			expect(example.title.length).toBeGreaterThan(0);
			expect(example.prompt.length).toBeGreaterThan(20);
		}
	});

	test("the template names the tools of the agent connector", () => {
		const template = promptExamples.at(-1)?.prompt ?? "";
		for (const tool of [
			"get_script_guide",
			"validate_script",
			"propose_script",
		])
			expect(template).toContain(tool);
	});

	test("the triggers explain gestures and measurements", () => {
		const names = reactionTriggers.map((row) => row.name).join(" ");
		expect(names).toContain("gesture");
		expect(names).toContain("measurement");
	});
});
