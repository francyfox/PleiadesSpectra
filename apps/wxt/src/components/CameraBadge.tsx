import { StatusDot } from "@repo/ui/status-dot";

/**
 * Always visible while the camera is on: the camera is never on without a visible sign. While only scripts hold the
 * camera (no question), a click on it pauses the camera for the page.
 */
export function CameraBadge() {
	return (
		<button
			type="button"
			class="camera-badge"
			x-bind:class="cameraBadgeClass"
			x-bind:title="cameraBadgeTitle"
			x-show="isCameraBadgeVisible"
			x-cloak=""
			x-on:click="pauseCamera"
		>
			<StatusDot x-bind:data-tone="cameraTone" />
			<span x-text="cameraBadgeText" />
		</button>
	);
}
