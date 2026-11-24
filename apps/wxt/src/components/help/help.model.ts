export type HelpTab = "simple" | "camera" | "reactions" | "developer";

export function isHelpTab(value: unknown): value is HelpTab {
	return (
		value === "simple" ||
		value === "camera" ||
		value === "reactions" ||
		value === "developer"
	);
}

/** The smallest useful script: asks a question when an element becomes visible and presses a button. */
export const LIKE_EXAMPLE_SOURCE = `// ==Reaction==
// @name      Smile to like
// @match     *://example.com/*
// @gestures  smile
// ==/Reaction==

reaction("like").onVisible(".like-popup", async (ctx) => {
  const answer = await ctx.ask("Like this page?", { expect: ["smile"] });

  if (answer === "smile") document.querySelector("#like")?.click();
});
`;

/** A script with a constant camera: scrolls the page by tilting the head. */
export const SCROLL_EXAMPLE_SOURCE = `// @ts-check
// ==Reaction==
// @name      Scroll by tilt
// @match     *://*/*
// @camera    always
// @gestures  tilt-down, tilt-up
// ==/Reaction==

reaction("scroll")
  .cooldown(400)
  .minConfidence(0.6)
  .onGesture("tilt-down", () => scrollBy({ top: 400, behavior: "smooth" }))
  .onGesture("tilt-up", () => scrollBy({ top: -400, behavior: "smooth" }));
`;

export interface HelpRow {
	name: string;
	meaning: string;
}

/** The `==Reaction==` header: what the extension reads without running the code. */
export const headerFields: HelpRow[] = [
	{
		name: "@name",
		meaning: "Required. Shown in the list and the install window.",
	},
	{ name: "@author", meaning: "Optional. Shown in the install window." },
	{
		name: "@match",
		meaning:
			"Required, one line per pattern, e.g. *://shop.example.com/*. The sites the script runs on.",
	},
	{
		name: "@camera",
		meaning:
			"on-demand (default): the camera is on only while ctx.ask waits. always: needed for onGesture.",
	},
	{
		name: "@gestures",
		meaning:
			"Comma-separated gestures the script uses; the install window lists them.",
	},
	{
		name: "@signals",
		meaning:
			"Comma-separated measurements the script reads: blink, pose, expression, pulse. Without it the script gets none.",
	},
];

/** The chain behind the global `reaction()`. */
export const chainMembers: HelpRow[] = [
	{
		name: "onVisible(selector, handler)",
		meaning:
			"Runs when a matching element becomes visible to the user (rendered and in the viewport; { scope: false } skips the viewport), again each time it hides and shows.",
	},
	{
		name: "onEvent(target, type, handler)",
		meaning:
			"A DOM event: target is a selector or an event target such as window.",
	},
	{
		name: "onGesture(gesture, handler)",
		meaning: "A gesture from the camera. Needs @camera always.",
	},
	{
		name: "onSignal(name, handler)",
		meaning:
			"A measurement from the camera: blink, pose, expression or pulse. Needs @signals and @camera always.",
	},
	{
		name: "cooldown(ms)",
		meaning: "Minimum time between two runs of the triggers declared after it.",
	},
	{
		name: "minConfidence(0–1)",
		meaning: "Ignores weaker gestures, for the triggers declared after it.",
	},
	{
		name: "use(reaction | fn)",
		meaning:
			"Adds the triggers of another reaction or applies a helper function.",
	},
	{
		name: "ctx.ask(question, { expect, timeoutMs, labels })",
		meaning:
			'Turns the camera on, shows the question and resolves with a gesture, a clicked option or "timeout" (8 s by default).',
	},
	{ name: "ctx.toast(text)", meaning: "A short message next to the page." },
	{
		name: "ctx.signals",
		meaning:
			"The recent measurements: latest(name), history(name, { withinMs }), blinks(ms), poseChange(ms), average(name, field, ms). Set your own conditions.",
	},
	{
		name: "ctx.onGesture / ctx.onEvent / ctx.onSignal",
		meaning:
			"Listen only while this run of the handler is alive: removed when the element hides, the page address changes or the reaction stops.",
	},
	{
		name: "reaction(id, { signal })",
		meaning:
			"Pass your own AbortController signal: controller.abort() removes every trigger of the reaction.",
	},
	{
		name: "ctx.cancel()",
		meaning:
			"Removes the trigger that fired the handler; the others keep working. reaction.stop() removes them all.",
	},
];

/** What each gesture is computed from. */
export const gestureRows: HelpRow[] = [
	{
		name: "nod, shake",
		meaning: "Head movement from the face landmarks, against the resting pose.",
	},
	{ name: "tilt-down, tilt-up", meaning: "Head tilt from the face landmarks." },
	{
		name: "roll-left, roll-right",
		meaning:
			"Head leaned to your own left or right shoulder, once per lean: come back upright for the next one.",
	},
	{
		name: "smile, confused",
		meaning: "Smoothed SmartSpectra expression scores.",
	},
	{ name: "talking", meaning: "SmartSpectra speech detection from the video." },
];

/** The short checklist, from SmartSpectra's “Getting a Good Measurement”. */
export const cameraChecklist: HelpRow[] = [
	{
		name: "Light",
		meaning:
			"Even, soft light on your face, from the front or a little to the side. No window or lamp behind you, no harsh shadows, no flicker.",
	},
	{
		name: "Frame",
		meaning:
			"One face, centered, looking at the camera. Not so close that it is cut off, not so far that it is small.",
	},
	{
		name: "Stay still",
		meaning:
			"Sit still and keep the camera steady, for example on a stand. Big movements make gestures unreliable.",
	},
	{
		name: "Wait a moment",
		meaning:
			"The camera needs a few seconds to adjust after it turns on. The script starts listening when it is ready.",
	},
];

/** What the on-screen hints mean and what to do. */
export const cameraHints: HelpRow[] = [
	{
		name: "No face found",
		meaning: "Get your face into the picture and look at the camera.",
	},
	{
		name: "Multiple faces",
		meaning: "Make sure only one person is in the picture.",
	},
	{ name: "Face not centered", meaning: "Move to the middle of the picture." },
	{ name: "Too dark", meaning: "Add light or move to a brighter place." },
	{
		name: "Too bright",
		meaning: "Turn the light down or move away from a window behind you.",
	},
	{
		name: "Too close / too far",
		meaning: "Sit back, or move closer, until your face fits comfortably.",
	},
	{
		name: "Face too high / too low",
		meaning: "Move up or down, or tilt the camera.",
	},
	{ name: "Face not forward", meaning: "Turn your face towards the camera." },
	{ name: "Too much motion", meaning: "Hold still for a moment." },
	{
		name: "Frame rate too low",
		meaning:
			"Add light and close other heavy programs. The camera needs about 25 frames per second.",
	},
];

/** What can start a script, for people who do not write code. */
export const reactionTriggers: HelpRow[] = [
	{
		name: "Something appears on the page",
		meaning:
			"A rating window, a banner, a video, a form: the script wakes up when it becomes visible, and again each time it shows.",
	},
	{
		name: "Something happens on the page",
		meaning: "A click, a key press, a scroll, a change of the page address.",
	},
	{
		name: "You make a gesture",
		meaning:
			"Nod, shake your head, tilt it down or up, smile, look confused, talk. Needs a script with a constant camera.",
	},
	{
		name: "A measurement changes",
		meaning:
			"How many times you blinked, where your head is turned, your expression, your pulse. The script sets its own condition, for example two blinks in a second and a half. Needs a script with a constant camera.",
	},
];

/** What a script can do once it has started. */
export const reactionActions: HelpRow[] = [
	{
		name: "Ask you a question",
		meaning:
			"A small window with Beta asks, and you answer with a gesture or with the mouse. It can stand in a corner, at the side or in the middle, and be small or large.",
	},
	{ name: "Show a short message", meaning: "A note next to the page." },
	{
		name: "Do what a script on the page can do",
		meaning:
			"Click a button, fill in a form, scroll, play or pause a video, change how the page looks.",
	},
];

export interface PromptExample {
	title: string;
	prompt: string;
}

/** Requests to paste into an AI agent that is connected through “Connect to AI”. */
export const promptExamples: PromptExample[] = [
	{
		title: "Rate a service with your face",
		prompt:
			"Write a Pleiades Spectra script for shop.example.com. When the rating window becomes visible, ask me “How was our service?” and let me answer with a smile (5 stars), a nod (4 stars) or a confused face (2 stars), or with the mouse. The camera should be on only while the question is open.",
	},
	{
		title: "Scroll a page by tilting your head",
		prompt:
			"Write a Pleiades Spectra script that scrolls any page down by most of the window height when I tilt my head down, and up when I tilt it up. It needs a constant camera (@camera always). Do not scroll more than once every 0.7 seconds.",
	},
	{
		title: "Pause a video with a shake of the head",
		prompt:
			"Write a Pleiades Spectra script for youtube.com. While a video is on the page, pause it when I shake my head and play it when I nod.",
	},
	{
		title: "Two blinks for the next heading",
		prompt:
			"Write a Pleiades Spectra script for any article. When I blink twice within one and a half seconds, scroll to the next heading. Use the blink measurement, and warn me in a comment that blink detection is experimental.",
	},
	{
		title: "Your own idea",
		prompt:
			"Write a Pleiades Spectra script for <website>. When <something happens on the page>, <what should happen>. Use <a gesture or a measurement: nod, shake, tilt, smile, blinks, head position>. Read the guide with get_script_guide first, check the file with validate_script, then send it with propose_script. I will press Install.",
	},
];
