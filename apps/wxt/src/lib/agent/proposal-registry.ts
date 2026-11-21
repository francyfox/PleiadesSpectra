import { PROPOSAL_WAIT_MS, type ProposalOutcome } from "@repo/protocol";

type Timers = Pick<typeof globalThis, "setTimeout" | "clearTimeout">;

export interface ProposalRegistry {
	/** Resolves with the user's decision, or `pending` when they do not answer within `waitMs`. */
	open(id: string, waitMs?: number): Promise<ProposalOutcome>;
	/** A decision made after the wait ran out is ignored: the agent already got `pending`. */
	settle(id: string, outcome: Exclude<ProposalOutcome, "pending">): void;
}

/** Remembers which agent proposal is waiting for which answer. */
export function createProposalRegistry(
	timers: Timers = globalThis,
): ProposalRegistry {
	const waiting = new Map<string, (outcome: ProposalOutcome) => void>();

	return {
		open(id, waitMs = PROPOSAL_WAIT_MS) {
			return new Promise<ProposalOutcome>((resolve) => {
				const timer = timers.setTimeout(() => {
					waiting.delete(id);
					resolve("pending");
				}, waitMs);
				waiting.set(id, (outcome) => {
					timers.clearTimeout(timer);
					resolve(outcome);
				});
			});
		},
		settle(id, outcome) {
			const resolve = waiting.get(id);
			if (!resolve) return;
			waiting.delete(id);
			resolve(outcome);
		},
	};
}
