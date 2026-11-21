export const HELP_OPEN_EVENT = "pleiades:open-help";

/** Any place on the page can open the help dialog without knowing about its component. */
export function requestHelpOpen(): void {
	window.dispatchEvent(new CustomEvent(HELP_OPEN_EVENT));
}
