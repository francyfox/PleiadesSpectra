import type {
	AskAnswer,
	Gesture,
	GestureEventDetail,
	SignalName,
	SignalSample,
	SignalValues,
	VitalName,
	WidgetOffset,
	WidgetPlace,
	WidgetPosition,
	WidgetSize,
	WidgetSizeName,
} from "@repo/protocol";

export type {
	AskAnswer,
	Gesture,
	GestureEventDetail,
	SignalName,
	SignalSample,
	SignalValues,
	VitalName,
	WidgetOffset,
	WidgetPlace,
	WidgetPosition,
	WidgetSize,
	WidgetSizeName,
};

export interface AskOptions {
	/** Gestures the user may answer with; each also becomes a mouse button. */
	expect: readonly Gesture[];
	/** Counted from the moment the camera is ready. Defaults to 8000. */
	timeoutMs?: number;
	/** Button text per gesture; defaults to the built-in English labels. */
	labels?: Partial<Record<Gesture, string>>;
	/** Where the widget stands: a named place, or distances in pixels from the edges of the window. Defaults to "bottom-right". */
	position?: WidgetPosition;
	/** "small" (120 px), "medium" (180 px, default), "large" (260 px), or the width of Beta in pixels (60–600). */
	size?: WidgetSize;
}

export interface ShowOptions {
	/** Where Beta stands: a named place, or distances in pixels from the edges of the window. Defaults to the widget's own place. */
	position?: WidgetPosition;
	/** "small" (120 px), "medium" (180 px), "large" (260 px), or the width of Beta in pixels (60–600). Defaults to the widget's own size. */
	size?: WidgetSize;
}

export interface ReactionOptions {
	/** `controller.abort()` removes every trigger of the reaction; a signal that is aborted already keeps it from starting. */
	signal?: AbortSignal;
}

export interface SignalHistoryOptions {
	/** Only samples from the last `withinMs` milliseconds. Omitted: the whole history (at most 60 seconds). */
	withinMs?: number;
}

/** Names of the fields of a signal whose value is a number, e.g. `"bpm"` for `pulse`. */
export type NumericSignalField<Name extends SignalName> = {
	[Field in keyof SignalValues[Name]]-?: NonNullable<
		SignalValues[Name][Field]
	> extends number
		? Field
		: never;
}[keyof SignalValues[Name]];

/**
 * The recent measurements of the signals the script declared in `@signals`. The history keeps at most 60 seconds
 * and 2000 samples per signal. The helpers only shorten common cases: everything can be computed from `history`.
 */
export interface SignalsApi {
	/**
	 * The last sample of a signal, or `undefined` when none has arrived yet.
	 *
	 * @example
	 * ```js
	 * const pulse = ctx.signals.latest("pulse");
	 * if (pulse?.value.stable) console.log(pulse.value.bpm);
	 * ```
	 */
	latest<Name extends SignalName>(name: Name): SignalSample<Name> | undefined;
	/**
	 * The samples of a signal, oldest first. `withinMs` keeps only the last milliseconds.
	 *
	 * @example
	 * ```js
	 * const yaws = ctx.signals.history("pose", { withinMs: 2000 }).map((s) => s.value.yaw);
	 * ```
	 */
	history<Name extends SignalName>(
		name: Name,
		options?: SignalHistoryOptions,
	): SignalSample<Name>[];
	/**
	 * How many blinks happened in the last `withinMs` milliseconds: rising edges (`false` → `true`) of `blink`.
	 * `blink` is not verified against real blinks yet.
	 *
	 * @example
	 * ```js
	 * if (ctx.signals.blinks(1500) >= 2) ctx.toast("Two blinks");
	 * ```
	 */
	blinks(withinMs?: number): number;
	/**
	 * How far the head pose moved in the last `withinMs` milliseconds: the last `pose` sample minus the first,
	 * in eye distances. `{ yaw: 0, pitch: 0 }` when there are fewer than two samples.
	 *
	 * @example
	 * ```js
	 * const { yaw } = ctx.signals.poseChange(1000);
	 * if (yaw > 0.3) console.log("turned right");
	 * ```
	 */
	poseChange(withinMs?: number): { yaw: number; pitch: number };
	/**
	 * The mean of a numeric field over the last `withinMs` milliseconds, or `undefined` when there are no samples.
	 *
	 * @example
	 * ```js
	 * const bpm = ctx.signals.average("pulse", "bpm", 10_000);
	 * ```
	 */
	average<Name extends SignalName>(
		name: Name,
		field: NumericSignalField<Name>,
		withinMs?: number,
	): number | undefined;
}

export interface SignalOptions {
	/** Skips samples that come sooner than this many milliseconds after the last one that ran the handler. */
	minIntervalMs?: number;
}

export interface ReactionContext {
	/** Recent signal measurements; the signals must be declared in `@signals` (with `@camera always`). */
	signals: SignalsApi;
	/**
	 * Turns the camera on, shows the question and resolves with the gesture, the clicked option or `"timeout"`.
	 * A question is dropped (and resolves with `"timeout"`) when the page address changes or the element that
	 * started it disappears.
	 *
	 * @example
	 * ```js
	 * const answer = await ctx.ask("Like this page?", {
	 *   expect: ["smile", "confused"],
	 *   labels: { smile: "Yes", confused: "Not sure" },
	 *   position: "top-left",
	 * });
	 * if (answer === "smile") likePage();
	 * ```
	 */
	ask(question: string, options: AskOptions): Promise<AskAnswer>;
	/**
	 * Shows a short message next to the page.
	 *
	 * @example
	 * ```js
	 * ctx.toast("Thanks for the feedback!");
	 * ```
	 */
	toast(text: string): void;
	/**
	 * Beta stands on the page without a question and shows a measurement while its samples keep coming: a pinwheel
	 * and "measuring…" until the first value, then a beating heart and the number of bpm for `"pulse"`. It stays until
	 * `ctx.hide()` or until the reaction stops (`reaction.stop()`, an aborted `signal`); the handler ending or
	 * the element hiding does not remove it. Calling it again moves or resizes Beta.
	 *
	 * The script must declare the signal in `@signals` (otherwise the measurements never reach it) and use
	 * `@camera always`, which the user turns on. The pulse is not a medical reading.
	 *
	 * @example
	 * ```js
	 * // @signals pulse
	 * // @camera always
	 * reaction("calm").onVisible("article", (ctx) => {
	 *   ctx.show("pulse", { position: "top-right", size: "small" });
	 * });
	 * ```
	 */
	show(vital: VitalName, options?: ShowOptions): void;
	/**
	 * Takes away the Beta that this script showed with `ctx.show`. Does nothing if nothing was shown.
	 *
	 * @example
	 * ```js
	 * reaction("calm").onVisible(".done", (ctx) => {
	 *   ctx.hide();
	 *   ctx.toast("Thanks for reading");
	 * });
	 * ```
	 */
	hide(): void;
	/**
	 * Removes the trigger that fired this handler; the other triggers of the reaction keep working.
	 * Inside a subscription made with `ctx.onGesture` or `ctx.onEvent` it removes that subscription only.
	 *
	 * @example
	 * ```js
	 * reaction("once").onVisible(".banner", (ctx) => {
	 *   ctx.toast("Hello");
	 *   ctx.cancel(); // never fires again, even if the banner shows once more
	 * });
	 * ```
	 */
	cancel(): void;
	/**
	 * Listens for a gesture only while this run of the handler is alive. The subscription is removed
	 * automatically when the element that fired the trigger is hidden or removed, the page address changes,
	 * `ctx.cancel()` or `reaction.stop()` is called, or the same trigger fires again for the same element.
	 * `minConfidence` and `cooldown` of the reaction apply. Needs `@camera always` in the header.
	 * Returns a function that removes the subscription earlier.
	 *
	 * Subscribe before the first `await`: after the run has ended the call does nothing.
	 *
	 * @example
	 * ```js
	 * reaction("player").onVisible("video.promo", (ctx) => {
	 *   ctx.onGesture("nod", () => document.querySelector("video.promo")?.play());
	 *   ctx.onGesture("shake", () => document.querySelector("video.promo")?.pause());
	 * }); // both stop listening when the video is hidden
	 * ```
	 */
	onGesture(gesture: Gesture, handler: Handler<GestureContext>): () => void;
	/**
	 * Listens for a DOM event only while this run of the handler is alive; the rules and the cleanup are
	 * the same as for `ctx.onGesture`. `target` is a selector (delegated on the document) or an event target.
	 *
	 * @example
	 * ```js
	 * reaction("modal").onVisible(".modal", (ctx) => {
	 *   ctx.onEvent(window, "keydown", ({ domEvent }) => {
	 *     if (domEvent.key === "Escape") ctx.toast("Closing…");
	 *   });
	 * }); // the keydown listener is gone once the modal is closed
	 * ```
	 */
	onEvent(
		target: string | EventTarget,
		type: string,
		handler: Handler<DomEventContext>,
	): () => void;
	/**
	 * Listens for samples of a signal only while this run of the handler is alive; the rules and the cleanup are
	 * the same as for `ctx.onGesture`. `cooldown` of the reaction applies; `minConfidence` does not.
	 *
	 * @example
	 * ```js
	 * reaction("reader").onVisible("article", (ctx) => {
	 *   ctx.onSignal("pose", ({ sample }) => {
	 *     if (sample.value.pitch > 0.4) ctx.toast("Keep reading");
	 *   }, { minIntervalMs: 500 });
	 * });
	 * ```
	 */
	onSignal<Name extends SignalName>(
		name: Name,
		handler: Handler<SignalContext<Name>>,
		options?: SignalOptions,
	): () => void;
}

export interface VisibleOptions {
	/** `true` (default): the element must also be inside the viewport, so it is visible to the user. `false`: it only has to be rendered. */
	scope?: boolean;
}

export interface VisibleContext extends ReactionContext {
	element: Element;
}

export interface DomEventContext extends ReactionContext {
	domEvent: Event;
	/** The element matched by a selector target, `null` when the target was an event target object. */
	element: Element | null;
}

export interface GestureContext extends ReactionContext {
	event: GestureEventDetail;
}

export interface SignalContext<Name extends SignalName = SignalName>
	extends ReactionContext {
	/** The measurement that fired the trigger; its `value` is typed by the signal name. */
	sample: SignalSample<Name>;
}

export type Handler<Ctx> = (context: Ctx) => void | Promise<void>;

/** Reusable chunk of a chain: receives the reaction and returns it. */
export type ReactionPlugin = (reaction: Reaction) => Reaction;

export interface Reaction {
	readonly name: string;
	/**
	 * Fires when a matching element becomes visible to the user (rendered and inside the viewport; `scope: false`
	 * skips the viewport check), again each time it hides and shows. Subscriptions made in the handler with
	 * `ctx.onGesture` and `ctx.onEvent` end when the element hides.
	 *
	 * @example
	 * ```js
	 * reaction("rating").onVisible(".rating-modal", async (ctx) => {
	 *   const answer = await ctx.ask("How was it?", { expect: ["smile", "confused"] });
	 *   if (answer === "smile") ctx.element.querySelector("#rate-5")?.click();
	 * });
	 * ```
	 */
	onVisible(
		selector: string,
		handler: Handler<VisibleContext>,
		options?: VisibleOptions,
	): Reaction;
	/**
	 * Fires on a DOM event. `target` is a selector (delegated on the document, so elements added later work too)
	 * or an event target such as `window`.
	 *
	 * @example
	 * ```js
	 * reaction("confirm").onEvent(".buy", "click", async (ctx) => {
	 *   const answer = await ctx.ask("Sure?", { expect: ["nod", "shake"] });
	 *   if (answer === "shake") ctx.domEvent.preventDefault();
	 * });
	 * ```
	 */
	onEvent(
		target: string | EventTarget,
		type: string,
		handler: Handler<DomEventContext>,
	): Reaction;
	/**
	 * Fires when the camera recognises the gesture. Needs `@camera always` in the header, otherwise the extension
	 * never delivers gestures.
	 *
	 * @example
	 * ```js
	 * reaction("scroll")
	 *   .cooldown(400)
	 *   .onGesture("tilt-down", () => scrollBy({ top: 400, behavior: "smooth" }));
	 * ```
	 */
	onGesture(gesture: Gesture, handler: Handler<GestureContext>): Reaction;
	/**
	 * Fires on every sample of a signal that the extension delivers. Declare the signal in `@signals` and use
	 * `@camera always`. `cooldown` applies; `minConfidence` does not (confidence is part of the value).
	 * `options.minIntervalMs` limits the rate of one trigger (`pose` comes up to 15 times a second).
	 * The pulse is not a medical reading.
	 *
	 * @example
	 * ```js
	 * reaction("blinks").onSignal("blink", (ctx) => {
	 *   if (ctx.signals.blinks(2000) >= 2) ctx.toast("Two blinks");
	 * });
	 * ```
	 */
	onSignal<Name extends SignalName>(
		name: Name,
		handler: Handler<SignalContext<Name>>,
		options?: SignalOptions,
	): Reaction;
	/**
	 * Minimum time between two runs of each trigger declared after this call.
	 *
	 * @example
	 * ```js
	 * reaction("scroll").cooldown(400).onGesture("tilt-down", scrollDown);
	 * ```
	 */
	cooldown(milliseconds: number): Reaction;
	/**
	 * Ignores gestures below this confidence (0–1) for triggers declared after this call. Signals are not filtered by it.
	 *
	 * @example
	 * ```js
	 * reaction("nodding").minConfidence(0.7).onGesture("nod", next);
	 * ```
	 */
	minConfidence(confidence: number): Reaction;
	/**
	 * Adds the triggers of another reaction, or applies a script function to this one.
	 *
	 * @example
	 * ```js
	 * const withCooldown = (r) => r.cooldown(500);
	 * reaction("a").use(withCooldown).onGesture("nod", next);
	 * ```
	 */
	use(source: Reaction | ReactionPlugin): Reaction;
	/**
	 * Removes every listener and observer of this reaction, also when called before it has started.
	 *
	 * @example
	 * ```js
	 * const nudge = reaction("nudge").onVisible(".promo", showNudge);
	 * setTimeout(() => nudge.stop(), 60_000); // stop nudging after a minute
	 * ```
	 */
	stop(): void;
}
