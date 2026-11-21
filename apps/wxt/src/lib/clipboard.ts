export function isClipboardSupported(): boolean {
	return typeof navigator.clipboard?.writeText === "function";
}

/** False when the browser has no clipboard API or refuses to write; the page then hides its copy buttons. */
export async function copyText(text: string): Promise<boolean> {
	if (!isClipboardSupported()) return false;
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
