/** `ValidationCode` values of the SDK that the shrinking of the frame answers, so a person is not told about them. */
const CHEST_NOT_VISIBLE = 7;
const FACE_TOO_CLOSE = 13;
const FACE_TOO_HIGH = 15;
const FACE_TOO_LOW = 16;

export const SILENT_CODES: readonly number[] = [
	CHEST_NOT_VISIBLE,
	FACE_TOO_CLOSE,
	FACE_TOO_HIGH,
	FACE_TOO_LOW,
];
/** The SDK changes its advice in a blink; a toast needs time to be read. */
export const MIN_TOAST_GAP_MS = 4000;
/** The same advice is not repeated sooner than this, even if the SDK flips away from it and back. */
export const SAME_TOAST_GAP_MS = 15000;

/** The advice of the SDK as a toast: shown once for a while, nothing for the codes that the shrinking answers. */
export function createHintToaster(
	show: (text: string) => void,
	now: () => number = Date.now,
): (code: number, hint: string) => void {
	let lastText = "";
	let lastAtMs = Number.NEGATIVE_INFINITY;

	return (code, hint) => {
		if (!hint || SILENT_CODES.includes(code)) return;
		const nowMs = now();
		if (nowMs - lastAtMs < MIN_TOAST_GAP_MS) return;
		if (hint === lastText && nowMs - lastAtMs < SAME_TOAST_GAP_MS) return;
		lastText = hint;
		lastAtMs = nowMs;
		show(hint);
	};
}
