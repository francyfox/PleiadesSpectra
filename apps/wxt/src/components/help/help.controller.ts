import { Alpine, refsOf } from "@/lib/alpine";
import { isClipboardSupported } from "@/lib/clipboard";
import { AGENT_DIALOG_HASH } from "@/lib/open-plugins-page";
import { type HelpTab, isHelpTab, promptExamples } from "./help.model";
import {
	copyPrompt,
	copyTypings,
	downloadTypings,
	highlightExamples,
} from "./help.service";
import { HELP_OPEN_EVENT } from "./help.utils";

const COPIED_MS = 2000;

type CopyTarget = "" | "typings";

/** Alpine CSP: the template only reads these getters and calls these methods. */
function createHelpData() {
	return {
		isHelpOpen: false,
		helpTab: "simple" as HelpTab,
		hasExamples: false,
		copiedTarget: "" as CopyTarget,

		get canCopy() {
			return isClipboardSupported();
		},
		get isSimpleTab() {
			return this.helpTab === "simple";
		},
		get isCameraTab() {
			return this.helpTab === "camera";
		},
		get isReactionsTab() {
			return this.helpTab === "reactions";
		},
		get isDeveloperTab() {
			return this.helpTab === "developer";
		},
		get simpleTabSelected() {
			return String(this.helpTab === "simple");
		},
		get cameraTabSelected() {
			return String(this.helpTab === "camera");
		},
		get reactionsTabSelected() {
			return String(this.helpTab === "reactions");
		},
		get developerTabSelected() {
			return String(this.helpTab === "developer");
		},
		get typingsCopyLabel() {
			return this.copiedTarget === "typings" ? "Copied!" : "Copy typings";
		},

		init() {
			window.addEventListener(HELP_OPEN_EVENT, () => void this.openHelp());
		},
		async openHelp() {
			this.isHelpOpen = true;
			if (this.hasExamples) return;
			const examples = await highlightExamples();
			const refs = refsOf(this);
			if (refs.likeCode) refs.likeCode.innerHTML = examples.like;
			if (refs.scrollCode) refs.scrollCode.innerHTML = examples.scroll;
			this.hasExamples = true;
		},
		closeHelp() {
			this.isHelpOpen = false;
		},
		selectHelpTab(event: Event) {
			const tab = (event.currentTarget as HTMLElement).dataset.tab;
			if (isHelpTab(tab)) this.helpTab = tab;
		},
		downloadTypings() {
			downloadTypings();
		},
		async copyTypings() {
			await this.showCopied(copyTypings(), "typings");
		},
		/** The button says which example it holds by `data-prompt`; it shows “Copied!” through `data-copied` for a moment. */
		async copyPromptExample(event: Event) {
			const button = event.currentTarget as HTMLElement;
			const example = promptExamples[Number(button.dataset.prompt)];
			if (!example || !(await copyPrompt(example.prompt))) return;
			button.dataset.copied = "";
			setTimeout(() => button.removeAttribute("data-copied"), COPIED_MS);
		},
		/** The agent dialog belongs to the page, which already opens it when the address says `#agent`. */
		openAgent() {
			this.isHelpOpen = false;
			location.hash = AGENT_DIALOG_HASH;
		},
		async showCopied(copying: Promise<boolean>, target: CopyTarget) {
			if (!(await copying)) return;
			this.copiedTarget = target;
			setTimeout(() => {
				this.copiedTarget = "";
			}, COPIED_MS);
		},
	};
}

export function registerHelpData(): void {
	Alpine.data("help", createHelpData);
}
