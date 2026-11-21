export const emotions = [
	"neutral",
	"happy",
	"sad",
	"angry",
	"contempt",
	"disgust",
	"fear",
	"surprise",
	"focused",
	"confused",
] as const;

export type Emotion = (typeof emotions)[number];

export const expressionNames = [
	"ANGRY",
	"CONTEMPT",
	"DISGUST",
	"FEAR",
	"HAPPY",
	"NEUTRAL",
	"SAD",
	"SURPRISE",
] as const;

export type ExpressionName = (typeof expressionNames)[number];

/** SmartSpectra expression scores, 0–100 per expression. */
export type ExpressionScores = Partial<Record<ExpressionName, number>>;

export interface EmotionTracker {
	emotion: Emotion;
	changedAt: number;
}

const EMOTION_BY_EXPRESSION: Record<ExpressionName, Emotion> = {
	ANGRY: "angry",
	CONTEMPT: "contempt",
	DISGUST: "disgust",
	FEAR: "fear",
	HAPPY: "happy",
	NEUTRAL: "neutral",
	SAD: "sad",
	SURPRISE: "surprise",
};

/**
 * One closed shape per mouth: the top lip and the bottom lip as two cubic curves, so the CSS `d` transition can
 * morph between any two. A closed mouth has both lips on the same line, an open one fills with the mouth colour.
 * The origin is the centre of the mouth on the picture; `MOUTH_ANCHOR` puts it there and tilts it like the head.
 */
const MOUTH_PATH_BY_EMOTION: Record<Emotion, string> = {
	neutral: "M-34 0 C-12 0, 12 0, 34 0 C12 0, -12 0, -34 0 Z",
	happy: "M-36 -6 C-14 -2, 14 -2, 36 -6 C20 36, -20 36, -36 -6 Z",
	sad: "M-34 14 C-16 -16, 16 -16, 34 14 C16 -16, -16 -16, -34 14 Z",
	angry: "M-34 10 C-12 -4, 12 -4, 34 10 C12 -4, -12 -4, -34 10 Z",
	contempt: "M-34 6 C-8 8, 14 2, 34 -16 C14 2, -8 8, -34 6 Z",
	disgust: "M-34 0 C-12 -16, 12 16, 34 0 C12 16, -12 -16, -34 0 Z",
	fear: "M-44 0 C-20 -8, 20 -8, 44 0 C32 18, -32 18, -44 0 Z",
	surprise: "M-14 0 C-14 -22, 14 -22, 14 0 C14 26, -14 26, -14 0 Z",
	focused: "M-24 0 C-8 0, 8 0, 24 0 C8 0, -8 0, -24 0 Z",
	confused: "M-32 6 C-14 -14, 14 22, 32 -2 C14 22, -14 -14, -32 6 Z",
};

/**
 * One cubic curve per eyebrow, drawn for the right brow with its inner end at the negative x side.
 * The left brow reuses the same curve mirrored by `BROW_PLACEMENTS`.
 * Shapes follow what SmartSpectra reacted to on FACS-coded photos (`docs/emotions`): fear is raised and drawn
 * together, surprise is raised and arched, anger is pulled down and in. Disgust keeps the brows unfurrowed,
 * because furrowed brows with a wrinkled nose were read as anger.
 */
const BROW_PATH_BY_EMOTION: Record<Emotion, string> = {
	neutral: "M-30 4 C-10 -4, 10 -4, 30 2",
	happy: "M-30 4 C-10 -6, 10 -6, 30 4",
	sad: "M-30 -8 C-10 -2, 10 2, 30 8",
	angry: "M-30 14 C-10 8, 10 -2, 30 -8",
	contempt: "M-30 2 C-10 -2, 10 -8, 30 -8",
	disgust: "M-30 -8 C-10 10, 10 10, 30 -8",
	fear: "M-30 -14 C-10 -18, 10 -12, 30 -2",
	surprise: "M-30 -8 C-10 -26, 10 -26, 30 -8",
	focused: "M-30 6 C-10 4, 10 4, 30 6",
	confused: "M-30 2 C-10 -8, 10 4, 30 -2",
};

/** Centres of the eyebrows on `beta_plugin.webp`, tilted like the head; the left one is mirrored. */
export const BROW_PLACEMENTS = {
	right: "translate(320 240) rotate(-14) scale(1.3)",
	left: "translate(118 292) rotate(-14) scale(-1.3 1.3)",
} as const;

/** Where the cheeks of Beta are on `beta_plugin.webp`; they turn green when she feels sick (🤢) and red when she is happy. */
export const CHEEK_TINTS = [
	{ x: 108, y: 480 },
	{ x: 372, y: 436 },
] as const;

const CHEEK_TINT_BY_EMOTION: Partial<
	Record<Emotion, { color: string; opacity: number }>
> = {
	happy: { color: "#f0605d", opacity: 0.5 },
	disgust: { color: "#7cc65a", opacity: 0.6 },
};

export const MOUTH_COLOR = "#f4a39b";
/** Strokes by the corners of the pressed sick mouth: the dimples, in the mouth's own coordinates. */
export const DIMPLE_PATHS = [
	"M-43 -8 C-48 -3, -48 5, -43 10",
	"M43 -8 C48 -3, 48 5, 43 10",
] as const;

export function tintStyleFor(emotion: Emotion): string {
	const tint = CHEEK_TINT_BY_EMOTION[emotion];
	return tint ? `opacity: ${tint.opacity}; fill: ${tint.color}` : "opacity: 0";
}

/** Disgust is not drawn with a frown, because SmartSpectra read frowning disgust as anger (`docs/emotions`). */
export function dimpleStyleFor(emotion: Emotion): string {
	return `opacity: ${emotion === "disgust" ? 1 : 0}`;
}

/** Where the mouth sits on `beta_plugin.webp` (762×855) and how the head is tilted, from the line between the eyes. */
export const MOUTH_ANCHOR = {
	x: 212,
	y: 528,
	tiltDegrees: -14,
	scale: 1.5,
} as const;

export const MIN_SCORE_PERCENT = 40;
export const MIN_DWELL_MS = 300;

export function mouthPathFor(emotion: Emotion): string {
	return MOUTH_PATH_BY_EMOTION[emotion];
}

export function browPathFor(emotion: Emotion): string {
	return BROW_PATH_BY_EMOTION[emotion];
}

/** Inline style that lets the CSS `d` transition animate the mouth; the `d` attribute alone is not animated. */
export function mouthStyleFor(emotion: Emotion): string {
	return `d: path("${mouthPathFor(emotion)}")`;
}

export function browStyleFor(emotion: Emotion): string {
	return `d: path("${browPathFor(emotion)}")`;
}

/** Dominant expression above the threshold, otherwise the current emotion stays. */
export function pickEmotion(
	scores: ExpressionScores,
	current: Emotion,
	minScore = MIN_SCORE_PERCENT,
): Emotion {
	const dominant = dominantExpression(scores);
	if (!dominant || dominant.score < minScore) return current;
	return EMOTION_BY_EXPRESSION[dominant.name];
}

/** Switches the emotion at most once per `MIN_DWELL_MS`, so the mouth does not flicker. */
export function trackExpression(
	tracker: EmotionTracker,
	scores: ExpressionScores,
	nowMs: number,
): EmotionTracker {
	const candidate = pickEmotion(scores, tracker.emotion);
	if (candidate === tracker.emotion) return tracker;
	if (nowMs - tracker.changedAt < MIN_DWELL_MS) return tracker;
	return { emotion: candidate, changedAt: nowMs };
}

function dominantExpression(
	scores: ExpressionScores,
): { name: ExpressionName; score: number } | null {
	let dominant: { name: ExpressionName; score: number } | null = null;
	for (const name of expressionNames) {
		const score = scores[name];
		if (score === undefined) continue;
		if (!dominant || score > dominant.score) dominant = { name, score };
	}
	return dominant;
}
