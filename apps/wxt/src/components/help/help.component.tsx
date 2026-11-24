import { Button } from "@repo/ui/button";
import { Dialog } from "@repo/ui/dialog";
import { Tab, Tabs } from "@repo/ui/tabs";
import framingImage from "@/assets/camera/framing-good-vs-bad.svg";
import setupImage from "@/assets/camera/hero-good-setup.svg";
import lightingImage from "@/assets/camera/lighting-good-vs-bad.svg";
import { AiLogos } from "@/components/AiLogos";
import {
	cameraChecklist,
	cameraHints,
	chainMembers,
	gestureRows,
	type HelpRow,
	headerFields,
	promptExamples,
	reactionActions,
	reactionTriggers,
} from "./help.model";

/** `plain` sets the names in the normal font, for rows that are words and not code. */
function RowTable(props: { rows: HelpRow[]; plain?: boolean }) {
	return (
		<table class="help__table">
			<tbody>
				{props.rows.map((row) => (
					<tr>
						<th scope="row">
							{props.plain ? row.name : <code>{row.name}</code>}
						</th>
						<td>{row.meaning}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function SimplePanel() {
	return (
		<div class="help__panel" x-show="isSimpleTab">
			<p>
				A script is a small text file. It tells the extension: “when this
				happens on this website, ask the user and do something”. You do not need
				to know how to code: your AI assistant writes it for you.
			</p>

			<h3>1. Connect your AI</h3>
			<p>
				Do this once. Pick Claude Code, Codex or another agent and copy the
				command that the window shows.
			</p>
			<Button
				variant="ghost"
				class="agent__button"
				title="Connect Claude, Codex or another AI agent"
				x-on:click="openAgent"
			>
				Connect to AI
				<AiLogos />
			</Button>

			<h3>2. Tell it what you want</h3>
			<p>
				For example: “On shop.com, when the rating window appears, let me answer
				with a smile.” The agent writes the script and sends it here.
			</p>

			<h3>3. Press Install</h3>
			<p>
				You will see a window with the websites the script works on, whether it
				uses the camera, and its code. Nothing is installed until you press
				Install: an agent can never do it on its own.
			</p>

			<h3>Good to know</h3>
			<ul>
				<li>
					The camera is on only while a script asks a question, or while a page
					that a script with a constant camera works on is open and in front.
					You agree to that when you install the script. A red dot always shows
					when it is on; click it, or use the popup, to pause the camera on the
					page.
				</li>
				<li>You can answer with the mouse instead of a gesture.</li>
				<li>
					Install only scripts you understand: they can click and read the pages
					of the websites listed in the window.
				</li>
				<li>
					You can also drop a script file that ends with <code>.js</code> on
					this page.
				</li>
			</ul>

			<aside class="help__note">
				<strong>About your data.</strong> The camera picture goes only to the
				program on this computer and is never saved. Scripts get gestures and,
				if they ask for them, measurements such as blinks, head position and
				pulse, never the picture. A script runs on the websites listed in the
				install window and can pass what it receives on, like any script on a
				page, so install only scripts you trust. This is not a medical tool: the
				pulse is a rough estimate from video and does not diagnose or judge your
				health.
			</aside>
		</div>
	);
}

function Figure(props: { src: string; alt: string }) {
	return (
		<figure class="help__figure">
			<img src={props.src} alt={props.alt} loading="lazy" />
		</figure>
	);
}

function CameraPanel() {
	return (
		<div class="help__panel" x-show="isCameraTab" x-cloak="">
			<p>
				Scripts read your facial expression and head movement from the camera. A
				good picture makes them faster and more reliable. The camera is on only
				while a script asks a question, and a red dot shows when it is on.
			</p>

			<Figure
				src={setupImage}
				alt="A good setup: centered, evenly lit, camera on a stable stand"
			/>

			<h3>Quick checklist</h3>
			<RowTable rows={cameraChecklist} />

			<h3>Light</h3>
			<Figure
				src={lightingImage}
				alt="Good lighting is even and from the front; bad lighting is one-sided with a hard shadow"
			/>

			<h3>Framing and distance</h3>
			<Figure
				src={framingImage}
				alt="Good distance shows the face and shoulders with a margin; too close clips the face; too far makes it small"
			/>

			<h3>If a hint appears</h3>
			<RowTable rows={cameraHints} />

			<h3>Your privacy</h3>
			<ul>
				<li>
					The video goes only to the program on this computer and is never saved
					to disk.
				</li>
				<li>
					Scripts get gestures such as “smile” or “nod” and, if you installed
					them with such a request, measurements like blinks, head position,
					pulse. Never the picture.
				</li>
				<li>
					This is not a medical tool: it does not measure or judge your health.
				</li>
			</ul>
			<p class="plugins__muted">
				Based on the{" "}
				<a
					href="https://smartspectra.presagetech.com/docs/measurement-quality"
					target="_blank"
					rel="noreferrer"
				>
					SmartSpectra guide to a good measurement
				</a>
				.
			</p>
		</div>
	);
}

function ReactionsPanel() {
	return (
		<div class="help__panel" x-show="isReactionsTab" x-cloak="">
			<p>
				A script is a rule: “when this happens, do that”. Here is what you can
				combine. Your AI assistant knows all of it, so describe the idea in
				plain words.
			</p>

			<h3>What can start a script</h3>
			<RowTable rows={reactionTriggers} plain />

			<h3>What a script can do</h3>
			<RowTable rows={reactionActions} plain />

			<p>
				There is no gaze reading, and the pulse is not a medical reading:
				scripts should never judge your health. Blink detection is still
				experimental.
			</p>

			<h3>Ask your AI</h3>
			<p>
				Copy a request, change the website and the details, and paste it into
				the agent you connected.
			</p>
			{promptExamples.map((example, index) => (
				<div class="help__prompt">
					<div class="help__prompt-head">
						<strong safe>{example.title}</strong>
						<Button
							variant="ghost"
							class="help__prompt-copy"
							title="Copy this request"
							x-show="canCopy"
							x-cloak=""
							data-prompt={String(index)}
							x-on:click="copyPromptExample"
						>
							<span class="help__prompt-copy-idle">Copy</span>
							<span class="help__prompt-copy-done">Copied!</span>
						</Button>
					</div>
					<p safe>{example.prompt}</p>
				</div>
			))}
		</div>
	);
}

function DeveloperPanel() {
	return (
		<div class="help__panel" x-show="isDeveloperTab" x-cloak="">
			<p>
				A script is one plain JavaScript file with no imports and no build step.
				It runs on the sites you list and gets the global{" "}
				<code>reaction()</code>.
			</p>

			<h3>The smallest script</h3>
			<div class="help__code" x-ref="likeCode" />
			<p>
				The top block is the header, the extension reads it without running the
				code. The chain below it is the behaviour.
			</p>

			<h3>Header</h3>
			<RowTable rows={headerFields} />

			<h3>Chain and context</h3>
			<RowTable rows={chainMembers} />

			<h3>Gestures</h3>
			<p>
				<code>nod</code>, <code>shake</code>, <code>tilt-down</code>,{" "}
				<code>tilt-up</code>, <code>roll-left</code>, <code>roll-right</code>,{" "}
				<code>smile</code>, <code>confused</code>, <code>talking</code>. There
				is no gaze and no health reading.
			</p>
			<RowTable rows={gestureRows} />

			<h3>A constant camera</h3>
			<div class="help__code" x-ref="scrollCode" />
			<p>
				Use <code>@camera always</code> only when asking is not possible, for
				example for scrolling. Installing it is the user's consent: the camera
				runs only while a page the script works on is open and in front, Beta
				stands in the corner with a red dot, and a click on the dot pauses it.
			</p>

			<h3>Editor types</h3>
			<p>
				JavaScript itself ignores <code>.d.ts</code> files, but your editor (VS
				Code, WebStorm) reads them: you get completion and docs for{" "}
				<code>reaction</code>, <code>onVisible</code>, <code>ctx.ask</code> and
				underlined typos. Save <code>reactions.d.ts</code> next to your script
				and start the file with these two lines:
			</p>
			<pre class="help__command">
				<code>{'/// <reference path="reactions.d.ts" />\n// @ts-check'}</code>
			</pre>
			<div class="plugin__actions">
				<Button
					variant="ghost"
					title="Download reactions.d.ts to keep next to your script"
					x-on:click="downloadTypings"
				>
					Download reactions.d.ts
				</Button>
				<Button
					variant="ghost"
					title="Copy reactions.d.ts for your editor"
					x-show="canCopy"
					x-cloak=""
					x-on:click="copyTypings"
					x-text="typingsCopyLabel"
				/>
			</div>

			<h3>Install and agents</h3>
			<p>
				Drop the <code>.js</code> file on this page. An AI agent connected over
				MCP can read the same guide with <code>get_script_guide</code>, check a
				file with <code>validate_script</code> and send it here with{" "}
				<code>propose_script</code>; you still press Install.
			</p>
		</div>
	);
}

/** “How to use”: a short path for people, camera tips, and the file format for developers. */
export function HelpDialog() {
	return (
		<Dialog
			class="help"
			x-data="help"
			x-show="isHelpOpen"
			x-cloak=""
			onClose="closeHelp"
			header={<h2>How to use</h2>}
		>
			<Tabs aria-label="Audience">
				<Tab
					data-tab="simple"
					x-on:click="selectHelpTab"
					x-bind:aria-selected="simpleTabSelected"
				>
					For everyone
				</Tab>
				<Tab
					data-tab="camera"
					x-on:click="selectHelpTab"
					x-bind:aria-selected="cameraTabSelected"
				>
					Use your camera
				</Tab>
				<Tab
					data-tab="reactions"
					x-on:click="selectHelpTab"
					x-bind:aria-selected="reactionsTabSelected"
				>
					What it can do
				</Tab>
				<Tab
					data-tab="developer"
					x-on:click="selectHelpTab"
					x-bind:aria-selected="developerTabSelected"
				>
					For developers
				</Tab>
			</Tabs>

			<div class="help__body">
				<SimplePanel />
				<CameraPanel />
				<ReactionsPanel />
				<DeveloperPanel />
			</div>
		</Dialog>
	);
}
