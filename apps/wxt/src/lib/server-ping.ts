export const SERVER_URL = "http://localhost:3001";

/** The server's liveness route: it answers `ok` and does nothing else. */
const HEALTH_URL = `${SERVER_URL}/health`;

const PING_TIMEOUT_MS = 1500;

/** `no-cors` is enough: any reply means the server is up, a network error means it is not. */
export async function isServerOnline(): Promise<boolean> {
	try {
		await fetch(HEALTH_URL, {
			mode: "no-cors",
			signal: AbortSignal.timeout(PING_TIMEOUT_MS),
		});
		return true;
	} catch {
		return false;
	}
}
