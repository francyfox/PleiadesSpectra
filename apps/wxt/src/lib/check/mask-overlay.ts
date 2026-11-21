import { FACE_MESH_KEY_POINTS } from "./mask-points";

const DOT_COLOR = "rgba(120, 255, 190, 0.85)";
const KEY_COLOR = "rgba(255, 90, 90, 0.95)";
const DOT_RADIUS = 1.4;
const KEY_RADIUS = 3.2;

/** The size the canvas is drawn in: the frame's own pixels, so a point lands where the SDK found it. */
function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
	if (canvas.width !== width) canvas.width = width;
	if (canvas.height !== height) canvas.height = height;
}

function drawDot(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
	color: string,
) {
	context.fillStyle = color;
	context.beginPath();
	context.arc(x, y, radius, 0, Math.PI * 2);
	context.fill();
}

/**
 * Draws the face mask over the picture: every landmark as a small dot, the ones the gestures are built on (eyes and
 * nose tip) larger and red. Points are flat `[x0, y0, x1, y1, ...]` in frame pixels.
 */
export function drawMask(
	canvas: HTMLCanvasElement,
	mask: { width: number; height: number; points: number[] },
): void {
	const context = canvas.getContext("2d");
	if (!context) return;
	fitCanvas(canvas, mask.width, mask.height);
	context.clearRect(0, 0, canvas.width, canvas.height);

	for (let index = 0; index < mask.points.length; index += 2)
		drawDot(
			context,
			mask.points[index] ?? 0,
			mask.points[index + 1] ?? 0,
			DOT_RADIUS,
			DOT_COLOR,
		);
	for (const landmark of FACE_MESH_KEY_POINTS)
		drawDot(
			context,
			mask.points[landmark * 2] ?? 0,
			mask.points[landmark * 2 + 1] ?? 0,
			KEY_RADIUS,
			KEY_COLOR,
		);
}

export function clearMask(canvas: HTMLCanvasElement): void {
	canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}
