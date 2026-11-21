import { browser } from "wxt/browser";
import { isPageConsoleMessage } from "./check.console";

/** Prints the Spectra lines the background sends to this page, as warnings when they are failures. */
export function listenForPageConsole(): void {
	browser.runtime.onMessage.addListener((message: unknown) => {
		if (!isPageConsoleMessage(message)) return;
		const print = message.level === "error" ? console.warn : console.log;
		print(message.line, message.payload);
	});
}
