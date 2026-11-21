import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { CheckIcon } from "@repo/ui/check-icon";
import { Chip } from "@repo/ui/chip";
import { ClaudeIcon } from "@repo/ui/claude-icon";
import { CodeIcon } from "@repo/ui/code-icon";
import { CodexIcon } from "@repo/ui/codex-icon";
import { CopyIcon } from "@repo/ui/copy-icon";
import { Dialog } from "@repo/ui/dialog";
import { IconButton } from "@repo/ui/icon-button";
import { StatusDot } from "@repo/ui/status-dot";
import { Switch } from "@repo/ui/switch";
import { Tab, Tabs } from "@repo/ui/tabs";
import { TrashIcon } from "@repo/ui/trash-icon";
import { AiLogos } from "@/components/AiLogos";
import { CopyField } from "@/components/CopyField";
import { HelpDialog } from "@/components/help/help";

/** Event modifiers are not valid JSX attribute names, so they go in through a spread. */
const dropEvents = {
	"x-on:dragover.prevent": "startDrag",
	"x-on:drop.prevent": "dropFiles",
};

function UserScriptsBanner() {
	return (
		<Card class="plugins__banner" x-show="needsUserScripts" x-cloak="">
			<h2>Allow user scripts</h2>
			<ol x-show="showChromeSteps">
				<li>Open chrome://extensions and find Pleiades Spectra.</li>
				<li>Open Details and turn on “Allow User Scripts”.</li>
				<li>Come back and reload this page.</li>
			</ol>
			<Button x-show="showFirefoxButton" x-on:click="requestUserScripts">
				Allow user scripts
			</Button>
		</Card>
	);
}

function InstallZone() {
	return (
		<Card
			class="plugins__drop"
			x-bind:data-dragging="draggingText"
			x-on:dragleave="stopDrag"
			{...dropEvents}
		>
			<p>Drop script files here</p>
			<Button
				variant="ghost"
				title="Choose script files on this computer"
				x-on:click="openFilePicker"
			>
				Choose files
			</Button>
			<input
				id="plugin-file-input"
				type="file"
				accept=".js"
				multiple
				hidden
				x-on:change="pickFiles"
			/>
		</Card>
	);
}

function PluginRow() {
	return (
		<Card class="plugin" x-bind:data-overlap="plugin.overlapAria">
			<div class="plugin__side">
				<IconButton
					label="Show code"
					data-action="code"
					x-bind:data-id="plugin.id"
				>
					<CodeIcon />
				</IconButton>
				<IconButton
					label="Delete script"
					class="ui-icon-button--danger"
					data-action="delete"
					x-bind:data-id="plugin.id"
				>
					<TrashIcon />
				</IconButton>
			</div>
			<div class="plugin__main">
				<div class="plugin__head">
					<div class="plugin__title">
						<strong x-text="plugin.name" />
						<span class="plugin__author" x-text="plugin.author" />
					</div>
					<Switch
						data-action="toggle"
						title="Turn the script on or off"
						x-bind:data-id="plugin.id"
						x-bind:aria-checked="plugin.enabledAria"
					>
						Enabled
					</Switch>
				</div>
				<div class="plugin__chips" x-chip-line="">
					<template x-for="match in plugin.matches" x-bind:key="match">
						<Chip x-text="match" />
					</template>
					<Chip
						x-bind:data-tone="plugin.cameraTone"
						x-text="plugin.cameraText"
					/>
					<template x-for="gesture in plugin.gestures" x-bind:key="gesture">
						<Chip x-text="gesture" />
					</template>
					<template x-for="signal in plugin.signals" x-bind:key="signal">
						<Chip x-text="signal" />
					</template>
				</div>
				<div class="plugin__overlap" x-show="plugin.sharesText" x-cloak="">
					<p class="plugin__shares" x-text="plugin.sharesText" />
					<template
						x-for="warning in plugin.overlapWarnings"
						x-bind:key="warning"
					>
						<p class="plugin__clash" x-text="warning" />
					</template>
				</div>
				<p
					class="plugins__physio"
					x-show="plugin.cameraNote"
					x-text="plugin.cameraNote"
				/>
				<p
					class="plugins__physio"
					x-show="plugin.physiologicalNote"
					x-text="plugin.physiologicalNote"
				/>
			</div>
		</Card>
	);
}

function CodeDialog() {
	return (
		<Dialog
			class="code-dialog"
			x-show="hasCodeView"
			x-cloak=""
			onClose="closeCode"
		>
			<h2 x-text="codeViewTitle">Script code</h2>
			<div class="code-dialog__body" x-ref="codeBody" />
		</Dialog>
	);
}

function PluginList() {
	return (
		<section class="plugins__list" x-on:click="onListClick">
			<template x-for="plugin in rows" x-bind:key="plugin.id">
				<PluginRow />
			</template>
			<Card x-show="isEmpty" x-cloak="">
				<p>No scripts yet.</p>
				<Button
					variant="ghost"
					title="How to use Pleiades Spectra"
					x-on:click="openHelp"
				>
					How to use
				</Button>
			</Card>
		</section>
	);
}

function InstallDialog() {
	return (
		<Dialog x-show="hasPreview" x-cloak="" onClose="dismissPreview">
			<h2 x-text="previewTitle">Install script</h2>
			<Chip class="plugins__proposal" x-show="previewIsProposal" x-cloak="">
				Proposed by an AI agent
			</Chip>
			<p
				class="plugins__error"
				x-show="previewIsInvalid"
				x-text="previewError"
			/>

			<div class="plugins__details" x-show="previewIsValid">
				<p>
					Author: <span x-text="previewAuthor" />
				</p>
				<div class="plugin__chips" x-chip-line="">
					<template x-for="match in previewMatches" x-bind:key="match">
						<Chip x-text="match" />
					</template>
				</div>
				<div class="plugin__chips" x-chip-line="">
					<Chip
						x-bind:data-tone="previewCameraTone"
						x-text="previewCameraText"
					/>
					<template x-for="gesture in previewGestures" x-bind:key="gesture">
						<Chip x-text="gesture" />
					</template>
					<template x-for="signal in previewSignals" x-bind:key="signal">
						<Chip x-text="signal" />
					</template>
				</div>
				<div class="plugin__overlap" x-show="hasPreviewOverlap" x-cloak="">
					<p class="plugin__shares" x-text="previewSharesText" />
					<template
						x-for="warning in previewOverlapWarnings"
						x-bind:key="warning"
					>
						<p class="plugin__clash" x-text="warning" />
					</template>
				</div>
				<p
					class="plugins__physio"
					x-show="previewCameraNote"
					x-text="previewCameraNote"
				/>
				<p
					class="plugins__physio"
					x-show="previewPhysiologicalNote"
					x-text="previewPhysiologicalNote"
				/>
				<pre class="plugin__code plugin__code--open">
					<code x-text="previewSource" />
				</pre>
			</div>

			<div class="plugin__actions">
				<Button
					x-show="previewIsValid"
					title="Install this script"
					x-on:click="confirmInstall"
				>
					Install
				</Button>
				<Button
					variant="ghost"
					title="Do not install"
					x-show="previewIsValid"
					x-on:click="dismissPreview"
				>
					Cancel
				</Button>
			</div>
		</Dialog>
	);
}

function AgentDialog() {
	return (
		<Dialog class="agent" x-show="isAgentOpen" x-cloak="" onClose="closeAgent">
			<h2 class="agent__title">
				Connect to AI
				<AiLogos />
			</h2>

			<div class="help__body">
				<p>
					Claude Code and other AI agents can write scripts for you and send
					them here. Nothing is installed until you press Install.
				</p>

				<div x-show="hasNoAgentToken" x-cloak="">
					<Button
						title="Create a secret URL for your agent"
						x-on:click="generateAgentUrl"
					>
						Generate agent connection URL
					</Button>
				</div>

				<div class="agent__details" x-show="hasAgentToken" x-cloak="">
					<div class="agent__status">
						<StatusDot x-bind:data-tone="agentStatusTone" />
						<span x-text="agentStatusText" />
					</div>
					<Switch
						title="Let agents reach this page while it stays open"
						x-bind:aria-checked="agentEnabledAria"
						x-on:click="toggleAgent"
					>
						Expose to agents
					</Switch>

					<h3>Agent server URL</h3>
					<CopyField
						value="agentMcpUrl"
						copy="copyAgentUrl"
						isCopied="urlCopied"
						isNotCopied="urlNotCopied"
						label="Copy URL"
					/>

					<h3>Add it to your agent</h3>
					<Tabs aria-label="Agent">
						<Tab
							data-tab="claude"
							x-on:click="selectAgentTab"
							x-bind:aria-selected="claudeTabSelected"
						>
							<ClaudeIcon />
							Claude Code
						</Tab>
						<Tab
							data-tab="codex"
							x-on:click="selectAgentTab"
							x-bind:aria-selected="codexTabSelected"
						>
							<CodexIcon />
							Codex
						</Tab>
						<Tab
							data-tab="custom"
							x-on:click="selectAgentTab"
							x-bind:aria-selected="customTabSelected"
						>
							Custom
						</Tab>
					</Tabs>
					<p class="plugins__muted" x-text="agentSnippetHint" />
					<CopyField
						value="agentSnippetCode"
						copy="copyAgentCommand"
						isCopied="snippetCopied"
						isNotCopied="snippetNotCopied"
						label="Copy command"
						show="isSingleLineSnippet"
					/>
					<div
						class="copy-field copy-field--top"
						x-show="isMultilineSnippet"
						x-cloak=""
					>
						<pre class="help__command">
							<code x-text="agentSnippetCode" />
						</pre>
						<IconButton
							label="Copy JSON"
							x-show="canCopy"
							x-cloak=""
							x-on:click="copyAgentCommand"
						>
							<CopyIcon x-show="snippetNotCopied" />
							<CheckIcon x-show="snippetCopied" x-cloak="" />
						</IconButton>
					</div>

					<Button
						variant="ghost"
						title="Create a new URL; the old one stops working"
						x-on:click="regenerateAgentUrl"
					>
						Regenerate URL (revokes the current one)
					</Button>

					<p class="plugins__muted">
						Anyone with this URL can ask your extension to propose scripts while
						the switch is on. Treat it like a password. Scripts are never
						installed without your confirmation. Keep this page open while your
						agent works.
					</p>
				</div>
			</div>
		</Dialog>
	);
}

/** Scripts page: permission banner, install zone, installed list, install dialog, help dialog. */
export function App() {
	return (
		<main class="plugins" x-data="pluginsPage">
			<header class="plugins__header">
				<h1>Scripts</h1>
				<div class="plugin__actions">
					<Button
						variant="ghost"
						class="agent__button"
						title="Connect Claude, Codex or another AI agent"
						x-on:click="openAgent"
					>
						Connect to AI
						<AiLogos />
					</Button>
					<Button
						variant="ghost"
						title="How to use Pleiades Spectra"
						x-on:click="openHelp"
					>
						How to use
					</Button>
				</div>
			</header>
			<UserScriptsBanner />
			<Card class="plugins__banner" x-show="hasRegistrationError" x-cloak="">
				<h2>The script could not be switched on</h2>
				<p class="plugins__error" x-text="registrationError" />
			</Card>
			<InstallZone />
			<PluginList />
			<InstallDialog />
			<CodeDialog />
			<HelpDialog />
			<AgentDialog />
		</main>
	);
}
