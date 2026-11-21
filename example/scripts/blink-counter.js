/// <reference path="reactions.d.ts" />
// @ts-check
// ==Reaction==
// @name        Blink counter
// @author      Claude
// @match       *://localhost/*
// @camera      always
// @signals     blink
// ==/Reaction==

/** Two blinks this close together count as a double blink. */
const DOUBLE_BLINK_WINDOW_MS = 1500;

/** After a toast, further blinks stay quiet for this long. */
const QUIET_AFTER_TOAST_MS = 3000;

let lastToastAt = Number.NEGATIVE_INFINITY;

/**
 * `blink` has not been checked against real blinks yet, so treat this as a demo of the signal API.
 * The handler runs on every sample, so a reaction-wide `cooldown` would swallow the first blink of a pair;
 * the quiet period is kept here, counted from the time of the sample.
 */
reaction("blink-counter").onSignal("blink", (ctx) => {
	const isQuiet = ctx.sample.at - lastToastAt < QUIET_AFTER_TOAST_MS;
	if (isQuiet || ctx.signals.blinks(DOUBLE_BLINK_WINDOW_MS) < 2) return;
	lastToastAt = ctx.sample.at;
	ctx.toast("Two blinks");
});
