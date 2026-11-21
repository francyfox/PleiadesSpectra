import { ClaudeIcon } from "@repo/ui/claude-icon";
import { CodexIcon } from "@repo/ui/codex-icon";
import { OpenAIIcon } from "@repo/ui/openai-icon";

/** The agents the connector is made for; the logos only tell the user which ones work. */
export function AiLogos() {
	return (
		<span class="ai-logos">
			<ClaudeIcon />
			<CodexIcon />
			<OpenAIIcon />
		</span>
	);
}
