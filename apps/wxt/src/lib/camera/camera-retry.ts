import { isCameraBusyError } from "./camera-error";

const BUSY_ATTEMPTS = 4;
const BUSY_WAIT_MS = 500;

/**
 * Opens the camera, and opens it again a few times while it is busy: the popup's preview or an earlier session may
 * still be letting go of it. Any other error, and the last busy one, are thrown as they are.
 */
export async function openWhenFree<Opened>(
	open: () => Promise<Opened>,
	wait: (ms: number) => Promise<void> = (ms) =>
		new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Opened> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await open();
		} catch (error) {
			if (!isCameraBusyError(error) || attempt >= BUSY_ATTEMPTS) throw error;
			await wait(BUSY_WAIT_MS);
		}
	}
}
