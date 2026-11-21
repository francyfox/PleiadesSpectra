// @ts-check
// ==Reaction==
// @name        Service rating
// @match       *://shop.example.com/*
// @camera      on-demand
// @gestures    smile, confused
// ==/Reaction==

/** @param {string} selector */
function clickElement(selector) {
	const element = document.querySelector(selector);
	if (element instanceof HTMLElement) element.click();
}

reaction("rating").onVisible(".rating-modal", async (ctx) => {
	const answer = await ctx.ask("How was our service?", {
		expect: ["smile", "confused"],
		labels: { smile: "Good", confused: "So-so" },
		timeoutMs: 8000,
	});

	if (answer === "smile") clickElement("#rate-5");
	if (answer === "confused") clickElement("#rate-2");
});
