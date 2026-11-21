import { browser } from "wxt/browser";
import {
	BROW_PLACEMENTS,
	CHEEK_TINTS,
	DIMPLE_PATHS,
	MOUTH_ANCHOR,
	MOUTH_COLOR,
} from "@/lib/emotion";

export interface BetaFaceProps {
	/** Size of `beta_plugin.webp` in its own pixels; the mouth and brows are placed in these coordinates. */
	pictureWidth?: number;
	pictureHeight?: number;
	/** Width on the page in CSS pixels; the height follows the picture's proportions. */
	displayWidth?: number;
}

const MOUTH_PLACEMENT = `translate(${MOUTH_ANCHOR.x} ${MOUTH_ANCHOR.y}) rotate(${MOUTH_ANCHOR.tiltDegrees}) scale(${MOUTH_ANCHOR.scale})`;

/**
 * The picture of Beta Lupus Regina with brows and a mouth drawn over it. The parent Alpine scope provides
 * `emotionLabel`, `browPath`, `browStyle`, `mouthPath` and `mouthStyle`, and optionally `poseStyle`, `baseStyle` and `overlayStyle` for
 * the poses, and the refs `poseLayer`, `pinwheelLayer` and `heartLayer` that the widget fills while a pose is on show (a scope
 * without them shows the drawn face).
 */
export function BetaFace({
	pictureWidth = 762,
	pictureHeight = 855,
	displayWidth = 180,
}: BetaFaceProps) {
	const displayHeight = Math.round(
		(displayWidth * pictureHeight) / pictureWidth,
	);
	return (
		<svg
			class="beta__face"
			viewBox={`0 0 ${pictureWidth} ${pictureHeight}`}
			width={displayWidth}
			height={displayHeight}
			role="img"
			aria-label="Beta Lupus Regina"
			x-bind:aria-label="emotionLabel"
		>
			<image
				class="beta__base"
				href={browser.runtime.getURL("/beta_plugin.webp")}
				width={pictureWidth}
				height={pictureHeight}
				x-bind:style="baseStyle"
			/>
			<g class="beta__pose" x-ref="poseLayer" x-bind:style="poseStyle" />
			<g class="beta__overlay" x-bind:style="overlayStyle">
				{CHEEK_TINTS.map(({ x, y }) => (
					<ellipse
						class="beta__tint"
						cx={x}
						cy={y}
						rx="30"
						ry="17"
						transform={`rotate(-14 ${x} ${y})`}
						fill="#7cc65a"
						style="opacity: 0"
						x-bind:style="tintStyle"
					/>
				))}
				{Object.values(BROW_PLACEMENTS).map((placement) => (
					<g transform={placement}>
						<path
							class="beta__brow"
							fill="none"
							stroke="#8f2f36"
							stroke-width="7"
							stroke-linecap="round"
							x-bind:d="browPath"
							x-bind:style="browStyle"
						/>
					</g>
				))}
				<g transform={MOUTH_PLACEMENT}>
					<path
						class="beta__mouth"
						fill={MOUTH_COLOR}
						stroke="#2a1d1d"
						stroke-width="5"
						stroke-linecap="round"
						stroke-linejoin="round"
						x-bind:d="mouthPath"
						x-bind:style="mouthStyle"
					/>
					{DIMPLE_PATHS.map((path) => (
						<path
							class="beta__dimple"
							d={path}
							fill="none"
							stroke="#2a1d1d"
							stroke-width="4"
							stroke-linecap="round"
							style="opacity: 0"
							x-bind:style="dimpleStyle"
						/>
					))}
				</g>
			</g>
			<g class="beta__pinwheel" x-ref="pinwheelLayer" />
			<g class="beta__heart" x-ref="heartLayer" />
		</svg>
	);
}
