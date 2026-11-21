import { createReactionFactory } from "./chain";

export { createReactionFactory } from "./chain";
export type { RuntimeEnvironment, Transport } from "./environment";
export type {
	AskOptions,
	DomEventContext,
	GestureContext,
	Handler,
	Reaction,
	ReactionContext,
	ReactionOptions,
	ReactionPlugin,
	ShowOptions,
	SignalContext,
	SignalHistoryOptions,
	SignalName,
	SignalOptions,
	SignalSample,
	SignalsApi,
	SignalValues,
	VisibleContext,
	VisibleOptions,
	VitalName,
	WidgetOffset,
	WidgetPlace,
	WidgetPosition,
	WidgetSize,
	WidgetSizeName,
} from "./types";

/**
 * Starts a reaction; its triggers run once the chain that follows is complete.
 *
 * @example
 * ```js
 * reaction("rating")
 *   .cooldown(1000)
 *   .onVisible(".rating-modal", async (ctx) => {
 *     const answer = await ctx.ask("How was it?", { expect: ["smile", "confused"] });
 *     if (answer === "smile") ctx.element.querySelector("#rate-5")?.click();
 *   });
 * ```
 */
export const reaction = createReactionFactory();
