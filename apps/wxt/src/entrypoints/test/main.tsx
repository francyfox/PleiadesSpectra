import "@repo/ui/styles.css";
import "./style.css";

import uiStyles from "@repo/ui/styles.css?inline";
import { Widget } from "@/components/Widget";
import widgetStyles from "@/entrypoints/content/style.css?inline";
import { mount, mountIsolated } from "@/lib/alpine";
import { subscribeToWidgetReplies } from "@/lib/widget-bus";
import { registerWidgetData } from "@/lib/widget-data";
import { runTestAction } from "@/lib/widget-test-actions";
import { App } from "./App";

function requireElement(selector: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`${selector} not found`);
	return element;
}

/** Same isolation as the content script: a shadow root with its own styles. */
function mountWidgetInShadowRoot(): void {
	const host = document.createElement("div");
	const shadowRoot = host.attachShadow({ mode: "open" });
	const styles = document.createElement("style");
	styles.textContent = `${uiStyles}\n${widgetStyles}`;
	const container = document.createElement("div");
	shadowRoot.append(styles, container);
	document.body.append(host);

	registerWidgetData();
	mountIsolated(container, <Widget />);
}

function handleActionClicks(bench: HTMLElement): void {
	bench.addEventListener("click", (event) => {
		const button = (event.target as HTMLElement).closest<HTMLElement>(
			"[data-action]",
		);
		if (button?.dataset.action) runTestAction(button.dataset.action);
	});
}

function logReplies(log: HTMLElement): void {
	subscribeToWidgetReplies((reply) => {
		const entry = document.createElement("li");
		entry.textContent = `${new Date().toLocaleTimeString()} ${JSON.stringify(reply)}`;
		log.prepend(entry);
	});
}

mount(requireElement("#app"), <App />);
handleActionClicks(requireElement(".bench"));
logReplies(requireElement("#reply-log"));
mountWidgetInShadowRoot();
