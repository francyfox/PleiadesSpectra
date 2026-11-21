import "@repo/ui/styles.css";
import "./style.css";

import { Widget } from "@/components/Widget";
import { mountIsolated } from "@/lib/alpine";
import { listenForForwardedGestures } from "@/lib/always/gesture-dispatch";
import { listenForPageConsole } from "@/lib/check/check.page-console";
import { listenForForwardedSignals } from "@/lib/signals/signal-dispatch";
import { registerWidgetData } from "@/lib/widget-data";

export default defineContentScript({
	matches: ["*://*/*"],
	cssInjectionMode: "ui",
	async main(context) {
		registerWidgetData();
		listenForForwardedGestures();
		listenForForwardedSignals();
		listenForPageConsole();

		const ui = await createShadowRootUi(context, {
			name: "pleiades-widget",
			position: "inline",
			anchor: "body",
			onMount: (container) => mountIsolated(container, <Widget />),
		});
		ui.mount();
	},
});
