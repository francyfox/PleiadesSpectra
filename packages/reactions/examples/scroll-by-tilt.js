// @ts-check
// ==Reaction==
// @name        Scroll by tilt
// @match       *://*/*
// @camera      always
// @gestures    tilt-down, tilt-up
// ==/Reaction==

reaction("scroll")
	.cooldown(400)
	.minConfidence(0.6)
	.onGesture("tilt-down", () => scrollBy({ top: 400, behavior: "smooth" }))
	.onGesture("tilt-up", () => scrollBy({ top: -400, behavior: "smooth" }));
