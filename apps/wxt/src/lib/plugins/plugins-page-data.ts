import { browser } from "wxt/browser";
import { requestHelpOpen } from "@/components/help/help";
import {
	type AgentConnection,
	type AgentConnectionState,
	createAgentConnection,
} from "../agent/agent-connection";
import { loadAgentSettings, saveAgentSettings } from "../agent/agent-settings";
import { type AgentTab, isAgentTab, snippetFor } from "../agent/agent-snippets";
import { createBridgeClient, type SocketLike } from "../agent/bridge-client";
import { handleBridgeRequest } from "../agent/bridge-handler";
import { createProposalRegistry } from "../agent/proposal-registry";
import { Alpine, refsOf } from "../alpine";
import { copyText, isClipboardSupported } from "../clipboard";
import { highlightJavaScript } from "../code-highlight";
import { AGENT_DIALOG_HASH } from "../open-plugins-page";
import { physiologicalNote, signalLabels } from "../signals/signals.utils";
import {
	ALWAYS_CAMERA_NOTE,
	cameraConsentNote,
	cameraModeText,
	type InstallPreview,
	prepareInstallPreview,
} from "./install-preview";
import { createPluginId } from "./plugin-id";
import { findOverlaps, overlapWith } from "./plugin-overlap";
import { toPluginRow } from "./plugin-row";
import { isUserScriptsAvailable, registerInstalledPlugins } from "./register";
import {
	deletePlugin,
	listStoredPlugins,
	savePlugin,
	setPluginEnabled,
} from "./store";
import type { InstalledPlugin } from "./types";

const IS_FIREFOX = import.meta.env.FIREFOX;
const FILE_INPUT_SELECTOR = "#plugin-file-input";
const COPIED_LABEL_MS = 2000;
const AGENT_STATUS_TEXT = {
	connected: "Connected: your agent can reach this page",
	connecting: "Connecting…",
	disconnected: "Not connected",
	replaced:
		"Another Scripts page took over: turn the switch off and on here to reclaim",
} as const;
const AGENT_STATUS_TONE = {
	connected: "ok",
	connecting: "busy",
	disconnected: "off",
	replaced: "off",
} as const;
const AGENT_FILE_NAME = "agent-proposal.js";

type CopyTarget = "" | "url" | "snippet";
type ListAction = "toggle" | "code" | "delete";

async function readPreviews(files: FileList): Promise<InstallPreview[]> {
	return Promise.all(
		[...files].map(async (file) =>
			prepareInstallPreview(file.name, await file.text()),
		),
	);
}

function readListClick(event: MouseEvent) {
	const button = (event.target as HTMLElement).closest<HTMLElement>(
		"[data-action]",
	);
	if (!button?.dataset.id) return null;
	return {
		action: button.dataset.action as ListAction,
		id: button.dataset.id,
	};
}

const proposals = createProposalRegistry();

/** Puts an agent's proposal into the install queue; it resolves when the user decides. */
function requestInstall(
	pushPreview: (preview: InstallPreview) => void,
	source: string,
) {
	const proposalId = crypto.randomUUID();
	pushPreview({
		...prepareInstallPreview(AGENT_FILE_NAME, source),
		proposalId,
	});
	return proposals.open(proposalId);
}

/** The agent's side of the connector, wired to this page: its state, its install dialog and the store. */
function connectAgentToPage(page: {
	agentState: AgentConnectionState;
	installQueue: InstallPreview[];
}): AgentConnection {
	return createAgentConnection({
		load: loadAgentSettings,
		save: saveAgentSettings,
		createClient: ({ url, onRequest, onStatus }) =>
			createBridgeClient({
				url,
				createSocket: (target) =>
					new WebSocket(target) as unknown as SocketLike,
				onRequest,
				onStatus,
			}),
		onRequest: (request) =>
			handleBridgeRequest(request, {
				listPlugins: listStoredPlugins,
				requestInstall: (source) =>
					requestInstall((preview) => page.installQueue.push(preview), source),
			}),
		onChange: (state) => {
			page.agentState = state;
		},
	});
}

/**
 * Alpine CSP: the template only reads these getters and calls these methods.
 * The list buttons share one click handler that reads `data-action` and `data-id`.
 */
function createPluginsPageData() {
	let agentConnection: AgentConnection;

	return {
		userScriptsAvailable: true,
		plugins: [] as InstalledPlugin[],
		codeViewId: null as string | null,
		registrationError: "",
		installQueue: [] as InstallPreview[],
		isDragging: false,
		isAgentOpen: false,
		agentState: {
			token: null,
			enabled: false,
			status: "disconnected",
			mcpUrl: null,
		} as AgentConnectionState,
		agentTab: "claude" as AgentTab,
		copiedTarget: "" as CopyTarget,

		get needsUserScripts() {
			return !this.userScriptsAvailable;
		},
		get showChromeSteps() {
			return !IS_FIREFOX;
		},
		get showFirefoxButton() {
			return IS_FIREFOX;
		},
		get draggingText() {
			return String(this.isDragging);
		},
		get rows() {
			const overlaps = findOverlaps(this.plugins);
			return this.plugins.map((plugin) =>
				toPluginRow(plugin, overlaps.get(plugin.id)),
			);
		},
		get hasAlwaysCameraScript() {
			return this.plugins.some((plugin) => plugin.header.camera === "always");
		},
		get alwaysCameraNote() {
			return ALWAYS_CAMERA_NOTE;
		},
		get physiologicalListNote() {
			const signals = this.plugins.flatMap(
				(plugin) => plugin.header.signals ?? [],
			);
			return physiologicalNote(signals);
		},
		get hasPhysiologicalScript() {
			return this.physiologicalListNote !== "";
		},
		get isEmpty() {
			return this.plugins.length === 0;
		},

		get currentPreview() {
			return this.installQueue[0] ?? null;
		},
		get hasPreview() {
			return this.currentPreview !== null;
		},
		get previewIsValid() {
			return this.currentPreview?.valid === true;
		},
		get previewIsInvalid() {
			return this.currentPreview?.valid === false;
		},
		get previewTitle() {
			const preview = this.currentPreview;
			if (!preview) return "";
			return preview.valid
				? preview.header.name
				: `Can't install ${preview.fileName}`;
		},
		get previewError() {
			const preview = this.currentPreview;
			return preview && !preview.valid ? preview.error : "";
		},
		get previewAuthor() {
			const preview = this.currentPreview;
			return preview?.valid ? (preview.header.author ?? "unknown") : "";
		},
		get previewMatches() {
			const preview = this.currentPreview;
			return preview?.valid ? preview.header.matches : [];
		},
		get previewGestures() {
			const preview = this.currentPreview;
			return preview?.valid ? preview.header.gestures : [];
		},
		get previewSignals() {
			const preview = this.currentPreview;
			return preview?.valid ? signalLabels(preview.header.signals ?? []) : [];
		},
		get previewPhysiologicalNote() {
			const preview = this.currentPreview;
			return preview?.valid
				? physiologicalNote(preview.header.signals ?? [])
				: "";
		},
		get previewCameraText() {
			const preview = this.currentPreview;
			return preview?.valid ? cameraModeText(preview.header.camera) : "";
		},
		get previewCameraNote() {
			const preview = this.currentPreview;
			return preview?.valid ? cameraConsentNote(preview.header.camera) : "";
		},
		get previewCameraTone() {
			const preview = this.currentPreview;
			return preview?.valid && preview.header.camera === "always"
				? "danger"
				: "neutral";
		},
		/** The new script against the installed ones that are on. */
		get previewOverlap() {
			const preview = this.currentPreview;
			if (!preview?.valid) return null;
			const overlap = overlapWith(
				preview.header,
				this.plugins.filter((plugin) => plugin.enabled),
			);
			return overlap.sharesWith.length > 0 ? overlap : null;
		},
		get hasPreviewOverlap() {
			return this.previewOverlap !== null;
		},
		get previewSharesText() {
			const overlap = this.previewOverlap;
			return overlap
				? `Runs on pages that these scripts also use: ${overlap.sharesWith.join(", ")}`
				: "";
		},
		get previewOverlapWarnings() {
			return this.previewOverlap?.warnings ?? [];
		},
		get previewIsProposal() {
			return this.currentPreview?.proposalId !== undefined;
		},
		get previewSource() {
			const preview = this.currentPreview;
			return preview?.valid ? preview.source : "";
		},

		openHelp() {
			requestHelpOpen();
		},

		get canCopy() {
			return isClipboardSupported();
		},
		get urlCopied() {
			return this.copiedTarget === "url";
		},
		get urlNotCopied() {
			return this.copiedTarget !== "url";
		},
		get snippetCopied() {
			return this.copiedTarget === "snippet";
		},
		get snippetNotCopied() {
			return this.copiedTarget !== "snippet";
		},
		get isSingleLineSnippet() {
			return this.agentTab !== "custom";
		},
		get isMultilineSnippet() {
			return this.agentTab === "custom";
		},
		get hasRegistrationError() {
			return this.registrationError !== "";
		},
		get hasCodeView() {
			return this.codeViewId !== null;
		},
		get codeViewTitle() {
			return this.codeViewPlugin?.header.name ?? "";
		},
		get codeViewPlugin() {
			return this.plugins.find((plugin) => plugin.id === this.codeViewId);
		},
		async openCode(id: string) {
			const plugin = this.plugins.find((item) => item.id === id);
			if (!plugin) return;
			const html = await highlightJavaScript(plugin.source);
			this.codeViewId = id;
			const body = refsOf(this).codeBody;
			if (body) body.innerHTML = html;
		},
		closeCode() {
			this.codeViewId = null;
		},

		get hasAgentToken() {
			return this.agentState.token !== null;
		},
		get hasNoAgentToken() {
			return this.agentState.token === null;
		},
		get agentMcpUrl() {
			return this.agentState.mcpUrl ?? "";
		},
		get agentSnippetCode() {
			return snippetFor(this.agentTab, this.agentState.mcpUrl ?? "").code;
		},
		get agentSnippetHint() {
			return snippetFor(this.agentTab, this.agentState.mcpUrl ?? "").hint;
		},
		get claudeTabSelected() {
			return String(this.agentTab === "claude");
		},
		get codexTabSelected() {
			return String(this.agentTab === "codex");
		},
		get customTabSelected() {
			return String(this.agentTab === "custom");
		},
		get agentStatusText() {
			return AGENT_STATUS_TEXT[this.agentState.status];
		},
		get agentStatusTone() {
			return AGENT_STATUS_TONE[this.agentState.status];
		},
		get agentEnabledAria() {
			return String(this.agentState.enabled);
		},

		openAgent() {
			this.isAgentOpen = true;
		},
		closeAgent() {
			this.isAgentOpen = false;
			if (location.hash === AGENT_DIALOG_HASH)
				history.replaceState(null, "", location.pathname);
		},
		async generateAgentUrl() {
			await agentConnection.generate();
		},
		async toggleAgent() {
			await agentConnection.setEnabled(!this.agentState.enabled);
		},
		async regenerateAgentUrl() {
			await agentConnection.regenerate();
		},
		async copyAgentUrl() {
			await this.copy(this.agentMcpUrl, "url");
		},
		selectAgentTab(event: Event) {
			const tab = (event.currentTarget as HTMLElement).dataset.tab;
			if (isAgentTab(tab)) this.agentTab = tab;
		},
		async copyAgentCommand() {
			await this.copy(this.agentSnippetCode, "snippet");
		},
		/** Shows “copied” on the button that was pressed for a moment. */
		async copy(text: string, target: CopyTarget) {
			if (!(await copyText(text))) return;
			this.copiedTarget = target;
			setTimeout(() => {
				this.copiedTarget = "";
			}, COPIED_LABEL_MS);
		},

		async init() {
			this.userScriptsAvailable = await isUserScriptsAvailable();
			await this.refresh();
			agentConnection = connectAgentToPage(this);
			await agentConnection.init();
			this.openAgentWhenAsked();
			window.addEventListener("hashchange", () => this.openAgentWhenAsked());
		},
		/** The popup's “Connect to AI” button opens this page with `#agent`. */
		openAgentWhenAsked() {
			if (location.hash === AGENT_DIALOG_HASH) this.isAgentOpen = true;
		},
		async refresh() {
			this.plugins = await listStoredPlugins();
		},

		openFilePicker() {
			document.querySelector<HTMLInputElement>(FILE_INPUT_SELECTOR)?.click();
		},
		startDrag() {
			this.isDragging = true;
		},
		stopDrag() {
			this.isDragging = false;
		},
		async pickFiles(event: Event) {
			const input = event.target as HTMLInputElement;
			if (input.files) await this.enqueueFiles(input.files);
			input.value = "";
		},
		async dropFiles(event: DragEvent) {
			this.isDragging = false;
			if (event.dataTransfer?.files)
				await this.enqueueFiles(event.dataTransfer.files);
		},
		async enqueueFiles(files: FileList) {
			this.installQueue.push(...(await readPreviews(files)));
		},

		async confirmInstall() {
			const preview = this.currentPreview;
			if (!preview?.valid) return;
			await savePlugin({
				id: createPluginId(preview.header.name, preview.source),
				source: preview.source,
				header: preview.header,
				enabled: true,
			});
			await this.applyChanges();
			this.finishPreview("installed");
		},
		dismissPreview() {
			this.finishPreview("declined");
		},
		/** Removes the first preview; an AI agent that proposed it is told what the user decided. */
		finishPreview(outcome: "installed" | "declined") {
			const finished = this.installQueue.shift();
			if (finished?.proposalId !== undefined)
				proposals.settle(finished.proposalId, outcome);
		},

		async onListClick(event: MouseEvent) {
			const click = readListClick(event);
			if (!click) return;
			if (click.action === "code") await this.openCode(click.id);
			else if (click.action === "toggle") await this.togglePlugin(click.id);
			else await this.removePlugin(click.id);
		},
		async togglePlugin(id: string) {
			const plugin = this.plugins.find((item) => item.id === id);
			if (!plugin) return;
			await setPluginEnabled(id, !plugin.enabled);
			await this.applyChanges();
		},
		async removePlugin(id: string) {
			await deletePlugin(id);
			await this.applyChanges();
		},

		async requestUserScripts() {
			await browser.permissions.request({ permissions: ["userScripts"] });
			this.userScriptsAvailable = await isUserScriptsAvailable();
			await this.applyChanges();
		},

		/** The list must follow the store even when registering the scripts fails; the reason is shown. */
		async applyChanges() {
			try {
				await registerInstalledPlugins();
				this.registrationError = "";
			} catch (error) {
				this.registrationError =
					error instanceof Error ? error.message : String(error);
			}
			await this.refresh();
		},
	};
}

export function registerPluginsPageData(): void {
	Alpine.data("pluginsPage", createPluginsPageData);
}
