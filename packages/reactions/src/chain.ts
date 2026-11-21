import type { Gesture, SignalName } from "@repo/protocol";
import { createPageEnvironment, type RuntimeEnvironment } from "./environment";
import { installRules } from "./install";
import type { Rule } from "./rules";
import type {
	DomEventContext,
	GestureContext,
	Handler,
	Reaction,
	ReactionOptions,
	ReactionPlugin,
	SignalContext,
	SignalOptions,
	VisibleContext,
	VisibleOptions,
} from "./types";

interface ReactionState {
	name: string;
	rules: Rule[];
	cooldownMs: number;
	minConfidence: number;
	isAdopted: boolean;
	isStopped: boolean;
	signal: AbortSignal | undefined;
	stop: () => void;
}

const stateByReaction = new WeakMap<Reaction, ReactionState>();

function stateOf(reaction: Reaction): ReactionState {
	const state = stateByReaction.get(reaction);
	if (!state) throw new Error("use() expects a reaction created by reaction()");
	return state;
}

function createState(
	name: string,
	signal: AbortSignal | undefined,
): ReactionState {
	return {
		name,
		rules: [],
		cooldownMs: 0,
		minConfidence: 0,
		isAdopted: false,
		isStopped: false,
		signal,
		stop: () => {},
	};
}

/** Modifiers apply to the triggers declared after them, like script order in Elysia. */
function limitsOf(state: ReactionState) {
	return {
		cooldownMs: state.cooldownMs,
		minConfidence: state.minConfidence,
	};
}

/** The other reaction hands over its rules and no longer starts on its own. */
function adopt(state: ReactionState, other: Reaction): void {
	const otherState = stateOf(other);
	otherState.isAdopted = true;
	state.rules.push(...otherState.rules);
}

function applySource(
	state: ReactionState,
	reaction: Reaction,
	source: Reaction | ReactionPlugin,
): void {
	if (typeof source === "function") source(reaction);
	else adopt(state, source);
}

function createChainMethods(state: ReactionState, reaction: Reaction) {
	const add = (rule: Rule): Reaction => {
		state.rules.push(rule);
		return reaction;
	};

	return {
		onVisible: (
			selector: string,
			handler: Handler<VisibleContext>,
			options?: VisibleOptions,
		) =>
			add({
				kind: "visible",
				selector,
				scope: options?.scope ?? true,
				handler,
				...limitsOf(state),
			}),
		onEvent: (
			target: string | EventTarget,
			type: string,
			handler: Handler<DomEventContext>,
		) => add({ kind: "event", target, type, handler, ...limitsOf(state) }),
		onGesture: (gesture: Gesture, handler: Handler<GestureContext>) =>
			add({ kind: "gesture", gesture, handler, ...limitsOf(state) }),
		onSignal: <Name extends SignalName>(
			signal: Name,
			handler: Handler<SignalContext<Name>>,
			options?: SignalOptions,
		) =>
			add({
				kind: "signal",
				signal,
				minIntervalMs: options?.minIntervalMs ?? 0,
				handler: handler as Handler<SignalContext>,
				...limitsOf(state),
			}),
		cooldown: (milliseconds: number) => {
			state.cooldownMs = milliseconds;
			return reaction;
		},
		minConfidence: (confidence: number) => {
			state.minConfidence = confidence;
			return reaction;
		},
		use: (source: Reaction | ReactionPlugin) => {
			applySource(state, reaction, source);
			return reaction;
		},
		stop: () => {
			state.isStopped = true;
			state.stop();
		},
	};
}

/**
 * The chain only collects rules; they start in a microtask, after the whole chain ran,
 * so `.use()` can still take rules away from another reaction.
 */
function startWhenChainIsBuilt(
	state: ReactionState,
	environment: RuntimeEnvironment,
): void {
	queueMicrotask(() => {
		if (state.isAdopted || state.isStopped || state.signal?.aborted) return;
		state.stop = installRules(state.rules, state.name, environment);
		state.signal?.addEventListener("abort", () => state.stop(), { once: true });
	});
}

function createReaction(
	name: string,
	environment: RuntimeEnvironment,
	options: ReactionOptions | undefined,
): Reaction {
	const state = createState(name, options?.signal);
	const reaction = { name } as Reaction;
	Object.assign(reaction, createChainMethods(state, reaction));
	stateByReaction.set(reaction, state);
	startWhenChainIsBuilt(state, environment);
	return reaction;
}

/** The page environment is resolved per call, so tests can pass their own. */
export function createReactionFactory(
	getEnvironment: () => RuntimeEnvironment = createPageEnvironment,
): (name: string, options?: ReactionOptions) => Reaction {
	return (name, options) => createReaction(name, getEnvironment(), options);
}
