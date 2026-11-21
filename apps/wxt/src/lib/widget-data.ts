import {
	heartMarkup,
	pinwheelMarkup,
	poseMarkup,
} from "@/components/BetaVitals";
import { Alpine, refsOf } from "./alpine";
import { beatSeconds, breathSeconds, preloadPoses } from "./beta-pose";
import {
	browPathFor,
	browStyleFor,
	dimpleStyleFor,
	mouthPathFor,
	mouthStyleFor,
	tintStyleFor,
} from "./emotion";
import { sendWidgetReply, subscribeToWidgetMessages } from "./widget-bus";
import { betaClassOf, betaStyleOf, widgetClassOf } from "./widget-layout";
import {
	applyMessage,
	breathingRateOf,
	cameraBadgeTextOf,
	cameraBadgeTitleOf,
	cameraToneOf,
	createInitialState,
	emotionOf,
	isCameraBadgeVisible,
	isHeldByPlugins,
	isMeasuring,
	isPausable,
	isQuestionVisible,
	isToastVisible,
	isVisible,
	poseOf,
	pulseOf,
	type ShownPose,
	secondsLeft,
	statusTextOf,
	toastTextOf,
} from "./widget-state";

const CLOCK_TICK_MS = 250;

/** Replaces what a layer holds; Alpine starts the bindings of the new markup and lets go of the old one. */
function fillLayer(layer: HTMLElement | undefined, markup: string): void {
	if (!layer) return;
	const childrenOf = () => Array.from(layer.children) as HTMLElement[];
	for (const child of childrenOf()) Alpine.destroyTree(child);
	layer.innerHTML = markup;
	for (const child of childrenOf()) Alpine.initTree(child);
}

/** The pose picture is shown through its group; `shake` turns the head to both sides by mirroring the picture. */
function poseStyleOf(pose: ReturnType<typeof poseOf>): string {
	if (!pose) return "opacity: 0";
	const mirror = pose.isMirrored ? "transform: scaleX(-1); " : "";
	return `${mirror}opacity: 1`;
}

/**
 * Alpine CSP forbids inline logic, so templates only read these getters and call these methods.
 * Timer and subscription live in the closure to keep them out of Alpine's reactive proxy.
 */
function createWidgetData() {
	let stopClock: (() => void) | null = null;
	let unsubscribe: (() => void) | null = null;

	return {
		state: createInitialState(),
		nowMs: Date.now(),
		/** The pose on show; replaced only when it changes, so the markup of an animation is not put in again. */
		shownPose: null as ShownPose | null,

		get isVisible() {
			return isVisible(this.state);
		},
		/** The question card; a shown measurement has none. */
		get isQuestionVisible() {
			return isQuestionVisible(this.state);
		},
		get isToastVisible() {
			return isToastVisible(this.state, this.nowMs);
		},
		get toastText() {
			return toastTextOf(this.state);
		},
		get isListening() {
			return this.state.phase === "listening";
		},
		get cameraOn() {
			return this.state.cameraOn;
		},
		get isCameraBadgeVisible() {
			return isCameraBadgeVisible(this.state);
		},
		get cameraBadgeText() {
			return cameraBadgeTextOf(this.state);
		},
		get cameraBadgeClass() {
			return isPausable(this.state) ? "camera-badge--pausable" : "";
		},
		get cameraBadgeTitle() {
			return cameraBadgeTitleOf(this.state);
		},
		get cameraTone() {
			return cameraToneOf(this.state);
		},
		get pluginName() {
			return this.state.pluginName;
		},
		get question() {
			return this.state.question;
		},
		get options() {
			return this.state.options;
		},
		get statusText() {
			return statusTextOf(this.state, this.nowMs);
		},
		/** The pill under Beta: "measuring…" while a shown measurement waits for its first sample, otherwise her emotion. */
		get betaLabel() {
			return isMeasuring(this.state, this.nowMs)
				? statusTextOf(this.state, this.nowMs)
				: emotionOf(this.state);
		},
		get secondsLeft() {
			return secondsLeft(this.state, this.nowMs);
		},
		get widgetClass() {
			return widgetClassOf(this.state.look);
		},
		get betaClass() {
			return betaClassOf(this.state.look);
		},
		get betaStyle() {
			return betaStyleOf(this.state.look);
		},
		get poseStyle() {
			return poseStyleOf(this.shownPose);
		},
		/** The drawn face is hidden while a picture of another pose covers it. */
		get baseStyle() {
			return `opacity: ${this.shownPose ? 0 : 1}`;
		},
		get overlayStyle() {
			return `opacity: ${this.shownPose ? 0 : 1}`;
		},
		get heartDuration() {
			return `${beatSeconds(pulseOf(this.state)?.bpm)}s`;
		},
		get pulseText() {
			const bpm = pulseOf(this.state)?.bpm;
			return bpm === undefined ? "" : String(Math.round(bpm));
		},
		/** A number the SDK does not trust yet is dimmed. */
		get pulseNumberStyle() {
			return `opacity: ${pulseOf(this.state)?.stable ? 1 : 0.55}`;
		},
		get pinwheelDuration() {
			return `${breathSeconds(breathingRateOf(this.state))}s`;
		},
		get breathText() {
			const rate = breathingRateOf(this.state);
			return rate === undefined ? "" : String(Math.round(rate));
		},
		get vitalNumberStyle() {
			return "opacity: 1";
		},
		get emotionLabel() {
			return emotionOf(this.state);
		},
		get mouthPath() {
			return mouthPathFor(emotionOf(this.state));
		},
		get mouthStyle() {
			return mouthStyleFor(emotionOf(this.state));
		},
		get browPath() {
			return browPathFor(emotionOf(this.state));
		},
		get dimpleStyle() {
			return dimpleStyleFor(emotionOf(this.state));
		},
		get tintStyle() {
			return tintStyleFor(emotionOf(this.state));
		},
		get browStyle() {
			return browStyleFor(emotionOf(this.state));
		},

		/**
		 * Puts the pose on show: only its picture and animation are in the page, the layers of the others are empty.
		 * Alpine's CSP build has no `x-html`, so the layers are filled here.
		 */
		syncPose() {
			const next = poseOf(this.state, this.nowMs);
			const current = this.shownPose;
			const isSamePose =
				next?.name === current?.name &&
				next?.isMirrored === current?.isMirrored;
			if (isSamePose) return;
			if (next?.name !== current?.name) {
				const layers = refsOf(this);
				fillLayer(layers.poseLayer, next ? poseMarkup(next.name) : "");
				fillLayer(
					layers.pinwheelLayer,
					next?.name === "blow" ? pinwheelMarkup() : "",
				);
				fillLayer(
					layers.heartLayer,
					next?.name === "heart" ? heartMarkup() : "",
				);
			}
			this.shownPose = next;
		},

		init() {
			unsubscribe = subscribeToWidgetMessages((message) => {
				this.nowMs = Date.now();
				if (message.type === "widget/ask") preloadPoses();
				this.state = applyMessage(this.state, message, this.nowMs);
				this.syncPose();
			});
			sendWidgetReply({ type: "widget/ready" });
			const timerId = setInterval(() => {
				this.nowMs = Date.now();
				this.syncPose();
			}, CLOCK_TICK_MS);
			stopClock = () => clearInterval(timerId);
		},
		destroy() {
			stopClock?.();
			unsubscribe?.();
		},

		choose(value: string) {
			sendWidgetReply({ type: "widget/answer", value });
		},
		turnOffCamera() {
			if (this.state.cameraOn) sendWidgetReply({ type: "widget/camera-off" });
			else if (isHeldByPlugins(this.state)) this.pauseCamera();
		},
		/** The dot of the camera of scripts: it stops for this page; an open question is not touched. */
		pauseCamera() {
			if (isPausable(this.state))
				sendWidgetReply({ type: "widget/pause-camera" });
		},
	};
}

export function registerWidgetData(): void {
	Alpine.data("widget", createWidgetData);
}
