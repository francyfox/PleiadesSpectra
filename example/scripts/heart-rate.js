/// <reference path="reactions.d.ts" />
// @ts-check
// ==Reaction==
// @name        Heart rate
// @author      Claude
// @match       *://localhost/sleep*
// @match       *://www.youtube.com/watch*
// @camera      always
// @signals     pulse
// ==/Reaction==

/** The only YouTube video this demo touches. */
const DEMO_VIDEO_ID = "dQw4w9WgXcQ";

/**
 * Tells whether the page is allowed to show the pulse: the local sleep screen, or the one YouTube video above.
 * Other videos are left alone.
 * @returns {boolean}
 */
function isDemoPage() {
	if (location.hostname === "localhost") return true;
	return new URLSearchParams(location.search).get("v") === DEMO_VIDEO_ID;
}

/**
 * Beta stands in the corner with the beating heart and the bpm number. The pulse is only shown on the screen:
 * the script does not write it down or send it anywhere. It is not a medical reading.
 * @param {Reactions.VisibleContext} ctx
 */
function showPulse(ctx) {
	if (!isDemoPage()) return;
	ctx.show("pulse", { position: "bottom-right", size: "large" });
}

reaction("heart-rate")
	.onVisible("body", (ctx) => {
		if (location.hostname === "localhost") showPulse(ctx);
	})
	.onVisible("video", showPulse);
