import { browser } from "wxt/browser";
import {
	HEART_BEAT_SCALES,
	HEART_BEAT_TIMES,
	HEART_CENTER,
	HEART_COLORS,
	HEART_PATH,
} from "@/lib/beta-heart";
import {
	PINWHEEL_BLADE_COUNT,
	PINWHEEL_CENTER,
	PINWHEEL_COLORS,
	PINWHEEL_ROTATE_KEY_TIMES,
	PINWHEEL_ROTATE_VALUES,
	PINWHEEL_SHADOW,
	PINWHEEL_STICK,
	PINWHEEL_TILT,
	PINWHEEL_TURN_SECONDS,
	pinwheelBladePath,
	pinwheelFoldPath,
} from "@/lib/beta-pinwheel";
import { PICTURE_SIZE, POSE_FILE, type PoseName } from "@/lib/beta-pose";
import { VITAL_LABEL } from "@/lib/beta-vital-label";

/**
 * Everything here is drawn into the picture only while it is on show: the widget puts the markup into its layer and
 * takes it out again (the CSP build of Alpine has no `x-html`), so a hidden pose has no elements and no running
 * animation in the page.
 */

/** JSX of this extension is rendered at once, so the result is a string; an async component would be a mistake here. */
function markupOf(element: JSX.Element): string {
	if (typeof element !== "string")
		throw new Error("The markup of a pose must not be asynchronous");
	return element;
}

/** The number of a measurement and its unit. `text` and `style` are names in the widget scope. */
function VitalLabel(props: { text: string; style: string; unit: string }) {
	return (
		<g x-bind:style={props.style}>
			<text
				class="beta__vital-number"
				x={VITAL_LABEL.x}
				y={VITAL_LABEL.numberY}
				text-anchor="middle"
				x-text={props.text}
			/>
			<text
				class="beta__vital-unit"
				x={VITAL_LABEL.x}
				y={VITAL_LABEL.unitY}
				text-anchor="middle"
			>
				{props.unit}
			</text>
		</g>
	);
}

/** A gradient across a blade, from its lit side to its shaded side. */
function BladeGradient(props: {
	id: string;
	color: { light: string; base: string; dark: string };
}) {
	return (
		<linearGradient
			id={props.id}
			x1="0"
			y1="-70"
			x2="70"
			y2="0"
			gradientUnits="userSpaceOnUse"
		>
			<stop offset="0" stop-color={props.color.light} />
			<stop offset="0.5" stop-color={props.color.base} />
			<stop offset="1" stop-color={props.color.dark} />
		</linearGradient>
	);
}

function PinwheelGradients() {
	const { coral, sky, stick, pin } = PINWHEEL_COLORS;
	return (
		<defs>
			<BladeGradient id="pinwheel-coral" color={coral} />
			<BladeGradient id="pinwheel-sky" color={sky} />
			<linearGradient id="pinwheel-stick" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color={stick.light} />
				<stop offset="1" stop-color={stick.dark} />
			</linearGradient>
			<radialGradient id="pinwheel-pin" cx="0.35" cy="0.3" r="0.8">
				<stop offset="0" stop-color={pin.light} />
				<stop offset="0.45" stop-color={pin.base} />
				<stop offset="1" stop-color={pin.dark} />
			</radialGradient>
			<radialGradient id="pinwheel-shadow">
				<stop offset="0" stop-color="#2a1d1d" stop-opacity="0.45" />
				<stop offset="1" stop-color="#2a1d1d" stop-opacity="0" />
			</radialGradient>
		</defs>
	);
}

/** The stick, and the soft shadow that the vane throws on it. */
function PinwheelStick() {
	const { outline } = PINWHEEL_COLORS;
	const { endX, endY, width } = PINWHEEL_STICK;
	const { x, y, radiusX, radiusY, angle } = PINWHEEL_SHADOW;
	const { x: centerX, y: centerY } = PINWHEEL_CENTER;
	const shadowX = centerX + x;
	const shadowY = centerY + y;
	return (
		<>
			<line
				x1={centerX}
				y1={centerY}
				x2={endX}
				y2={endY}
				stroke={outline}
				stroke-width={width + 4}
				stroke-linecap="round"
			/>
			<line
				x1={centerX}
				y1={centerY}
				x2={endX}
				y2={endY}
				stroke="url(#pinwheel-stick)"
				stroke-width={width}
				stroke-linecap="round"
			/>
			<ellipse
				cx={shadowX}
				cy={shadowY}
				rx={radiusX}
				ry={radiusY}
				transform={`rotate(${angle} ${shadowX} ${shadowY})`}
				fill="url(#pinwheel-shadow)"
			/>
		</>
	);
}

/** The blades turn once in `PINWHEEL_TURN_SECONDS`, quickly and then slowly, like a breath. */
function PinwheelBlades() {
	const bladeAngle = 360 / PINWHEEL_BLADE_COUNT;
	return (
		<g>
			<animateTransform
				attributeName="transform"
				type="rotate"
				values={PINWHEEL_ROTATE_VALUES}
				keyTimes={PINWHEEL_ROTATE_KEY_TIMES}
				dur={`${PINWHEEL_TURN_SECONDS}s`}
				repeatCount="indefinite"
			/>
			{Array.from({ length: PINWHEEL_BLADE_COUNT }, (_, index) => (
				<g transform={`rotate(${index * bladeAngle})`}>
					<path
						d={pinwheelBladePath()}
						fill={
							index % 2 === 0 ? "url(#pinwheel-coral)" : "url(#pinwheel-sky)"
						}
						stroke={PINWHEEL_COLORS.outline}
						stroke-width="2.5"
						stroke-linejoin="round"
					/>
					<path d={pinwheelFoldPath()} fill="#ffffff" fill-opacity="0.28" />
				</g>
			))}
		</g>
	);
}

/** The pin in the middle, round and shiny, with a white glint. */
function PinwheelPin() {
	return (
		<>
			<circle
				r="9"
				fill="url(#pinwheel-pin)"
				stroke={PINWHEEL_COLORS.outline}
				stroke-width="2.5"
			/>
			<circle cx="-3" cy="-3.5" r="2.6" fill="#ffffff" fill-opacity="0.9" />
		</>
	);
}

/** The paper pinwheel on its stick, turned three quarters to us: Beta waits for a measurement. */
export function pinwheelMarkup(): string {
	const { x, y } = PINWHEEL_CENTER;
	const { scaleX, skewYDegrees } = PINWHEEL_TILT;
	return markupOf(
		<>
			<PinwheelGradients />
			<PinwheelStick />
			<g
				transform={`translate(${x} ${y}) skewY(${skewYDegrees}) scale(${scaleX} 1)`}
			>
				<PinwheelBlades />
				<PinwheelPin />
			</g>
		</>,
	);
}

/** The heart in the fingers beats once in `heartDuration`, a strong push and a weaker one; the pulse stands beside it. */
export function heartMarkup(): string {
	const { fill, outline } = HEART_COLORS;
	return markupOf(
		<>
			<g transform={`translate(${HEART_CENTER.x} ${HEART_CENTER.y})`}>
				<g>
					<animateTransform
						attributeName="transform"
						type="scale"
						values={HEART_BEAT_SCALES}
						keyTimes={HEART_BEAT_TIMES}
						dur="1s"
						x-bind:dur="heartDuration"
						repeatCount="indefinite"
					/>
					<path
						d={HEART_PATH}
						fill={fill}
						stroke={outline}
						stroke-width="4"
						stroke-linejoin="round"
					/>
				</g>
			</g>
			<VitalLabel text="pulseText" style="pulseNumberStyle" unit="bpm" />
		</>,
	);
}

/** The picture of a pose, put over the drawn face. */
export function poseMarkup(name: PoseName): string {
	return markupOf(
		<image
			href={browser.runtime.getURL(POSE_FILE[name])}
			width={PICTURE_SIZE.width}
			height={PICTURE_SIZE.height}
		/>,
	);
}
