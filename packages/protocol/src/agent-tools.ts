import { z } from "zod";
import { agentToolNames } from "./agent-link";

/** Single source of truth for the MCP tools: the server lists and validates them, the extension executes them. */
export const agentToolDescriptions = {
	[agentToolNames.getGuide]:
		"Rules, typings and examples for writing a Pleiades Spectra script. Read this before writing one.",
	[agentToolNames.validate]:
		"Checks a script file's header without running it and reports what it would be allowed to do.",
	[agentToolNames.list]:
		"Lists the scripts installed in the user's extension (id, enabled, header).",
	[agentToolNames.get]:
		"Returns the full source of one installed script, e.g. to improve it.",
	[agentToolNames.propose]:
		"Proposes a script to the user. The extension shows its install dialog and this call returns after the user installs or declines it (or 'pending' if they do not answer in time). Nothing is installed without the user's confirmation.",
} as const;

const source = z
	.string()
	.max(64 * 1024)
	.describe("The full script file, including the ==Reaction== header.");

/** Raw zod shapes, the form MCP `registerTool` takes. */
export const agentToolInputs = {
	[agentToolNames.getGuide]: {},
	[agentToolNames.validate]: { source },
	[agentToolNames.list]: {},
	[agentToolNames.get]: {
		id: z.string().min(1).describe("Script id from list_scripts."),
	},
	[agentToolNames.propose]: { source },
} as const;

/** MCP behaviour hints: only `propose_script` changes anything, and only after the user agrees. */
export const agentToolAnnotations = {
	[agentToolNames.getGuide]: { readOnlyHint: true },
	[agentToolNames.validate]: { readOnlyHint: true },
	[agentToolNames.list]: { readOnlyHint: true },
	[agentToolNames.get]: { readOnlyHint: true },
	[agentToolNames.propose]: { readOnlyHint: false, destructiveHint: false },
} as const;

export const NOT_EXPOSED_MESSAGE =
	"The extension is not connected. Ask the user to open the Scripts page in the extension and turn on “Expose to agents”, then retry.";

export const MCP_INSTRUCTIONS = `Tools that read or change scripts run inside the user's browser extension. If a call fails because the extension is not connected, ask the user to open the Scripts page and turn on “Expose to agents”. Write scripts with get_script_guide, check them with validate_script, then propose_script: the user always confirms the install themselves.`;
