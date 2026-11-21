/// <reference path="reactions.d.ts" />
// @ts-check
// ==Reaction==
// @name        Rate our service
// @author      Claude
// @match       *://localhost/*
// @camera      on-demand
// @gestures    smile, nod, confused, shake
// ==/Reaction==

/**
 * The gesture the user makes, as the score of the 1–5 radio buttons in the form.
 * @type {Partial<Record<Reactions.Gesture, number>>}
 */
const SCORE_BY_GESTURE = { smile: 5, nod: 4, confused: 2, shake: 1 };

/**
 * The rating modal is in the page from the start, hidden. `onVisible` waits until the site opens it,
 * then the question is asked, the matching radio button is picked and the form is submitted.
 */
reaction("rate-our-service").onVisible("#rating-modal", async (ctx) => {
	const answer = await ctx.ask("How was our service?", {
		expect: ["smile", "nod", "confused", "shake"],
		labels: {
			smile: "5 · Great",
			nod: "4 · Good",
			confused: "2 · Meh",
			shake: "1 · Bad",
		},
		timeoutMs: 10000,
	});
	if (answer === "timeout") return;
	const score = SCORE_BY_GESTURE[answer];
	if (score === undefined) return;

	const form = ctx.element.querySelector("form");
	const radio = form?.querySelector(`input[name="rating"][value="${score}"]`);
	if (!form || !(radio instanceof HTMLInputElement)) return;

	radio.click();
	form.requestSubmit();
});
