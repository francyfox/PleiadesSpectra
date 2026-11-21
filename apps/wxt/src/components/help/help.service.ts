import reactionTypes from "@repo/reactions/reactions.d.ts?raw";
import { copyText } from "@/lib/clipboard";
import { highlightJavaScript } from "@/lib/code-highlight";
import { LIKE_EXAMPLE_SOURCE, SCROLL_EXAMPLE_SOURCE } from "./help.model";

export interface HighlightedExamples {
	like: string;
	scroll: string;
}

export async function highlightExamples(): Promise<HighlightedExamples> {
	const [like, scroll] = await Promise.all([
		highlightJavaScript(LIKE_EXAMPLE_SOURCE),
		highlightJavaScript(SCROLL_EXAMPLE_SOURCE),
	]);
	return { like, scroll };
}

export function copyTypings(): Promise<boolean> {
	return copyText(reactionTypes.trim());
}

/** The editor needs the file next to the script, so a download is easier than a copy. */
export function downloadTypings(): void {
	const url = URL.createObjectURL(
		new Blob([`${reactionTypes.trim()}\n`], { type: "text/plain" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = "reactions.d.ts";
	link.click();
	URL.revokeObjectURL(url);
}

export function copyPrompt(prompt: string): Promise<boolean> {
	return copyText(prompt);
}
