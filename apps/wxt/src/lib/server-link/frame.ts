import { FRAME_HEADER_BYTES } from "@repo/protocol";

/** Wire format of one video frame: u64 little-endian timestamp in microseconds, then RGBA pixels. */
export function encodeFrame(
	timestampUs: number,
	rgba: Uint8ClampedArray,
): ArrayBuffer {
	const buffer = new ArrayBuffer(FRAME_HEADER_BYTES + rgba.byteLength);
	new DataView(buffer).setBigUint64(0, BigInt(timestampUs), true);
	new Uint8Array(buffer, FRAME_HEADER_BYTES).set(rgba);
	return buffer;
}
