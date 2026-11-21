/// <reference path="reactions.d.ts" />
// @ts-check
// ==Reaction==
// @name        Breathing pinwheel
// @author      Claude
// @match       *://localhost/breathe*
// @camera      always
// @signals     breathing
// ==/Reaction==

/**
 * Beta stands in the corner with a pinwheel that turns with the breath and the breaths per minute.
 * The value is only shown on the screen, it is not stored or sent, and it is not a medical reading.
 */
reaction("breathing-pinwheel").onVisible("body", (ctx) => {
	ctx.show("breathing", { position: "bottom-right", size: "large" });
});
