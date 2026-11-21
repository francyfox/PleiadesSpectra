import "@repo/ui/styles.css";
import "./style.css";

import { mount } from "@/lib/alpine";
import { requestCameraPermission } from "@/lib/camera/camera-permission";
import { App } from "./App";

function requireElement(selector: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`${selector} not found`);
	return element;
}

mount(requireElement("#app"), <App />);

const status = requireElement("#permission-status");
requireElement("#allow-camera").addEventListener("click", async () => {
	const granted = await requestCameraPermission();
	status.textContent = granted
		? "Camera allowed. You can close this tab."
		: "Camera access was blocked. Allow it in the browser address bar and try again.";
});
