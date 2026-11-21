import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const LIGHT_THEME = "github-light";
const DARK_THEME = "github-dark";

let highlighter: Promise<HighlighterCore> | null = null;

/** The JavaScript regex engine needs no WebAssembly, which extension pages would not allow anyway. */
function loadHighlighter(): Promise<HighlighterCore> {
	highlighter ??= createHighlighterCore({
		themes: [
			import("@shikijs/themes/github-light"),
			import("@shikijs/themes/github-dark"),
		],
		langs: [import("@shikijs/langs/javascript")],
		engine: createJavaScriptRegexEngine(),
	});
	return highlighter;
}

/**
 * Both themes are emitted as CSS variables (`--shiki-light`, `--shiki-dark`);
 * `.shiki` rules in the page stylesheet pick one by `prefers-color-scheme`.
 */
export async function highlightJavaScript(code: string): Promise<string> {
	const core = await loadHighlighter();
	return core.codeToHtml(code, {
		lang: "javascript",
		themes: { light: LIGHT_THEME, dark: DARK_THEME },
		defaultColor: false,
	});
}
