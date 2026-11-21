import {
	isVitalName,
	isWidgetPlace,
	parseWidgetSize,
	type WidgetPlace,
	type WidgetSize,
} from "@repo/protocol";
import { type ExpressionName, expressionNames } from "./emotion";
import type { WidgetMessage } from "./messages";
import { publishWidgetMessage } from "./widget-bus";

const TEST_ASK = {
	type: "widget/ask",
	pluginName: "Service rating",
	question: "How was our service?",
	options: [
		{ value: "smile", label: "Good", gestureLabel: "🙂 smile" },
		{ value: "confused", label: "So-so", gestureLabel: "🤔 confused" },
	],
} as const satisfies WidgetMessage;

const EXPRESSION_ACTION_PREFIX = "expression:";
const PLACE_ACTION_PREFIX = "place:";
const SIZE_ACTION_PREFIX = "size:";
const GESTURE_ACTION_PREFIX = "gesture:";
const BREATHING_ACTION_PREFIX = "breathing:";
const PULSE_ACTION_PREFIX = "pulse:";
const SHOW_VITAL_ACTION_PREFIX = "show-vital:";
const UNSTABLE_PULSE_ACTION = "pulse-unstable";
const TEST_EXPRESSION_SCORE = 80;
const TEST_LISTENING_TIMEOUT_MS = 30000;

/** The place and size the next question is asked with, set by the place and size buttons. */
const testLook: { position?: WidgetPlace; size?: WidgetSize } = {};

function askMessage(): WidgetMessage {
	return { ...TEST_ASK, ...testLook };
}

const PHASE_MESSAGES: Record<string, () => WidgetMessage> = {
	ask: askMessage,
	listening: () => ({
		type: "widget/listening",
		timeoutMs: TEST_LISTENING_TIMEOUT_MS,
	}),
	accepted: () => ({ type: "widget/accepted", value: "smile" }),
	timeout: () => ({ type: "widget/timeout" }),
	error: () => ({ type: "widget/error", hint: "I can't see your face" }),
	hide: () => ({ type: "widget/hide" }),
	"hide-vital": () => ({ type: "widget/hide-vital" }),
};

function isExpressionName(value: string): value is ExpressionName {
	return (expressionNames as readonly string[]).includes(value);
}

function rememberLook(action: string): void {
	const place = action.slice(PLACE_ACTION_PREFIX.length);
	if (action.startsWith(PLACE_ACTION_PREFIX) && isWidgetPlace(place))
		testLook.position = place;
	if (action.startsWith(SIZE_ACTION_PREFIX))
		testLook.size = parseWidgetSize(
			Number(action.slice(SIZE_ACTION_PREFIX.length)) ||
				action.slice(SIZE_ACTION_PREFIX.length),
		);
}

function messageForAction(action: string): WidgetMessage | undefined {
	if (
		action.startsWith(PLACE_ACTION_PREFIX) ||
		action.startsWith(SIZE_ACTION_PREFIX)
	) {
		rememberLook(action);
		return askMessage();
	}
	if (action.startsWith(GESTURE_ACTION_PREFIX))
		return {
			type: "widget/gesture",
			gesture: action.slice(GESTURE_ACTION_PREFIX.length),
		};
	if (action.startsWith(BREATHING_ACTION_PREFIX))
		return {
			type: "widget/breathing",
			rate: Number(action.slice(BREATHING_ACTION_PREFIX.length)),
		};
	if (action.startsWith(SHOW_VITAL_ACTION_PREFIX)) {
		const vital = action.slice(SHOW_VITAL_ACTION_PREFIX.length);
		return isVitalName(vital)
			? { type: "widget/show-vital", vital, ...testLook }
			: undefined;
	}
	if (action === UNSTABLE_PULSE_ACTION)
		return { type: "widget/pulse", bpm: 74, stable: false };
	if (action.startsWith(PULSE_ACTION_PREFIX))
		return {
			type: "widget/pulse",
			bpm: Number(action.slice(PULSE_ACTION_PREFIX.length)),
			stable: true,
		};
	if (!action.startsWith(EXPRESSION_ACTION_PREFIX))
		return PHASE_MESSAGES[action]?.();

	const name = action.slice(EXPRESSION_ACTION_PREFIX.length);
	if (!isExpressionName(name)) return undefined;
	return {
		type: "widget/expression",
		scores: { [name]: TEST_EXPRESSION_SCORE },
	};
}

/** Sends the widget the message the test page button stands for, as the background would. */
export function runTestAction(action: string): void {
	const message = messageForAction(action);
	if (message) publishWidgetMessage(message);
}
