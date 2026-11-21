/**
 * The paper pinwheel that Beta spins with her breath. It is drawn over `blow.webp`, in front of the pursed lips, on a
 * stick that goes down to the right. The vane is flat paper turned a little away from us (squeezed across and
 * skewed), so it reads as a three-quarter view; the light comes from the top left.
 */
export const PINWHEEL_CENTER = { x: 546, y: 512 };

/** The vane is squeezed across and its right side sinks a little: the look of a vane turned about the vertical axis. */
export const PINWHEEL_TILT = { scaleX: 0.78, skewYDegrees: -9 };

export const PINWHEEL_RADIUS = 78;

export const PINWHEEL_BLADE_COUNT = 4;

/** The stick leaves the pin and goes down to the right, past the lower edge of the vane. */
export const PINWHEEL_STICK = { endX: 632, endY: 690, width: 9 };

/** Where the vane's shadow falls on the stick, below the pin. */
export const PINWHEEL_SHADOW = {
	x: 14,
	y: 52,
	radiusX: 26,
	radiusY: 11,
	angle: 62,
};

export const PINWHEEL_COLORS = {
	coral: { light: "#ffc2cc", base: "#ff8fa3", dark: "#e0607b" },
	sky: { light: "#c4e8ff", base: "#7cc4f5", dark: "#4a97d1" },
	stick: { light: "#f3d9a8", dark: "#b98a4e" },
	pin: { light: "#fffdf2", base: "#ffd84d", dark: "#c99a1c" },
	outline: "#2a1d1d",
};

/**
 * The turns in one breath: on the breath out (the first half) the vane speeds up, on the breath in it slows down, but
 * it never stops. A breath turns it once round, so it can loop without a jump.
 */
const SPEED_SAMPLES = 16;
const SLOWEST_SHARE_OF_SPEED = 0.2;

function angleAt(share: number): number {
	const burst = (1 - Math.cos(Math.PI * share)) / 2;
	return (
		360 *
		(SLOWEST_SHARE_OF_SPEED * share + (1 - SLOWEST_SHARE_OF_SPEED) * burst)
	);
}

const sampleShares = Array.from(
	{ length: SPEED_SAMPLES + 1 },
	(_, step) => step / SPEED_SAMPLES,
);

/** Values of the SMIL `rotate` animation: `angle cx cy` at even steps of one breath, joined by straight lines. */
export const PINWHEEL_ROTATE_VALUES = sampleShares
	.map((share) => `${angleAt(share).toFixed(1)} 0 0`)
	.join(";");

export const PINWHEEL_ROTATE_KEY_TIMES = sampleShares
	.map((share) => share.toFixed(4))
	.join(";");

/** One paper blade, lying between the axis x and the axis -y: a sail curled up to the tip. */
export function pinwheelBladePath(): string {
	const r = PINWHEEL_RADIUS;
	return `M0 0 L${r} 0 C${r} ${-r * 0.5}, ${r * 0.6} ${-r * 0.82}, ${r * 0.08} ${-r * 0.74} Z`;
}

/** The fold of a blade, the strip along its edge that catches the light. */
export function pinwheelFoldPath(): string {
	const r = PINWHEEL_RADIUS;
	return `M0 0 L${r} 0 C${r * 0.93} ${-r * 0.3}, ${r * 0.7} ${-r * 0.42}, ${r * 0.36} ${-r * 0.4} Z`;
}
