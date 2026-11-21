import { FRAME_HEADER_BYTES } from "@repo/protocol";

const BYTES_PER_PIXEL = 4;

export interface ParsedFrame {
	timestampUs: number;
	/** RGBA pixels in their own buffer, so it can be transferred to the worker. */
	pixels: ArrayBuffer;
}

export function expectedFrameBytes(width: number, height: number): number {
	return FRAME_HEADER_BYTES + width * height * BYTES_PER_PIXEL;
}

/** Splits the 8-byte timestamp header from the pixels; a message of any other size is not a frame. */
export function parseFrame(
	message: Uint8Array,
	width: number,
	height: number,
): ParsedFrame | null {
	if (message.byteLength !== expectedFrameBytes(width, height)) return null;

	const header = new DataView(
		message.buffer,
		message.byteOffset,
		FRAME_HEADER_BYTES,
	);
	const timestampUs = Number(header.getBigUint64(0, true));
	const pixels = new Uint8Array(message.subarray(FRAME_HEADER_BYTES)).buffer;
	return { timestampUs, pixels: pixels as ArrayBuffer };
}
