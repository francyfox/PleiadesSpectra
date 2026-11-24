import { Toast } from "@repo/ui/toast";
import { Beta } from "./Beta";
import { HintPopup } from "./HintPopup";

const escapeTurnsCameraOff = {
	"x-on:keydown.escape.window": "turnOffCamera",
};

const followsWindowWidth = {
	"x-resize.document": "resizeWindow($width)",
};

/** Esc turns the camera off from anywhere on the page. */
export function Widget() {
	return (
		<div
			class="widget"
			x-bind:class="widgetClass"
			x-data="widget"
			{...escapeTurnsCameraOff}
			{...followsWindowWidth}
		>
			<Beta />
			<HintPopup />
			<Toast
				class="toast"
				x-show="isToastVisible"
				x-cloak=""
				x-text="toastText"
			/>
		</div>
	);
}
