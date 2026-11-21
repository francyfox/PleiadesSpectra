import { BanIcon } from "@repo/ui/ban-icon";
import { Button } from "@repo/ui/button";
import { Chip } from "@repo/ui/chip";
import { CircleCheckIcon } from "@repo/ui/circle-check-icon";
import { StatusDot } from "@repo/ui/status-dot";
import { Switch } from "@repo/ui/switch";
import { AiLogos } from "@/components/AiLogos";
import { BetaFace } from "@/components/BetaFace";
import { BetaLabel } from "@/components/BetaLabel";

/** Quick controls: server status, camera, link to the scripts page with the counts of its scripts. */
export function App() {
	return (
		<main class="popup" x-data="popup">
			<div class="popup__status">
				<Switch
					title="Turn all scripts on or off"
					aria-label="Scripts"
					x-bind:aria-checked="pluginsEnabledChecked"
					x-on:click="togglePlugins"
				/>
				<Chip class="popup__server">
					<StatusDot x-bind:data-tone="serverTone" />
					<span x-text="serverText" />
				</Chip>
			</div>

			<div class="popup__intro popup__row">
				<div class="popup__heading">
					<div class="popup__title">PleiadesSpectra</div>
					<BetaLabel status="emotionStatus" size="small" />
				</div>
				<div x-bind:class="checkBetaClass">
					<BetaFace displayWidth={68} />
				</div>
			</div>

			<section
				class="popup__block popup__warning"
				x-show="needsUserScripts"
				x-cloak=""
			>
				<p class="popup__note">
					Scripts are switched off: turn on “Allow User Scripts” for this
					extension, then reload it.
				</p>
				<Button
					title="Open the extension's settings page"
					x-on:click="allowUserScripts"
				>
					Allow user scripts
				</Button>
			</section>

			<section class="popup__block" x-show="hasCameraBlock" x-cloak="">
				<p class="popup__note" x-show="isPausedHere" x-cloak="">
					Paused on this page until it is reloaded
				</p>
				<div class="popup__row" x-show="showCameraText" x-cloak="">
					<StatusDot x-bind:data-tone="cameraTone" />
					<span x-text="cameraText" />
				</div>
				<p
					class="popup__note"
					x-show="hasCameraProblem"
					x-cloak=""
					x-text="cameraProblem"
				/>
				<Button
					title="Open the page where the browser asks for the camera"
					x-show="needsCameraPermission"
					x-cloak=""
					x-on:click="allowCamera"
				>
					Allow camera
				</Button>
				<Button
					variant="danger"
					title="Stop the camera now"
					x-show="isCameraOn"
					x-on:click="turnOffCamera"
				>
					Turn off camera
				</Button>
			</section>

			<Button
				variant="ghost"
				class="popup__connect"
				title="Connect Claude, Codex or another AI agent"
				x-on:click="openAgent"
			>
				Connect to AI
				<AiLogos />
			</Button>

			<Button
				variant="ghost"
				class="popup__plugins"
				title="Open the scripts page"
				x-on:click="openPlugins"
			>
				Scripts
				<span class="popup__counts">
					<span class="popup__count">
						<CircleCheckIcon size={16} label="Active scripts" />
						<span x-text="activePluginsText" />
					</span>
					<span class="popup__count">
						<BanIcon size={16} label="Disabled scripts" />
						<span x-text="disabledPluginsText" />
					</span>
				</span>
			</Button>

			<section class="popup__block popup__check">
				<Chip
					class="popup__fps"
					title="Frames per second the camera really gives; the SDK needs 25 or more"
					x-show="isPreviewOn"
					x-cloak=""
					x-bind:data-tone="fpsTone"
					x-text="fpsText"
				/>
				<video
					class="popup__preview"
					x-ref="preview"
					x-show="isPreviewOn"
					x-cloak=""
					autoplay
					muted
					aria-label="Camera preview"
				/>
				<canvas
					class="popup__mask"
					x-ref="mask"
					x-show="isPreviewOn"
					x-cloak=""
					role="img"
					aria-label="Face mask drawn over the camera picture"
				/>
				<p
					class="popup__note"
					x-show="hasCheckNote"
					x-cloak=""
					x-text="checkNote"
				/>
				<div class="popup__check-row">
					<Button
						title="Turn the camera on for a moment and see what Spectra recognises"
						x-text="checkButtonText"
						x-on:click="toggleCheck"
					>
						Spectra check
					</Button>
				</div>
			</section>

			<section class="popup__block">
				<Switch
					title="Draw the face points that Spectra found over your picture"
					x-bind:aria-checked="maskChecked"
					x-on:click="toggleMask"
				>
					Show face mask
				</Switch>
				<Switch
					title="Print what Spectra sends back to the browser console"
					x-bind:aria-checked="showLogsChecked"
					x-on:click="toggleLogs"
				>
					Show logs
				</Switch>
			</section>
		</main>
	);
}
