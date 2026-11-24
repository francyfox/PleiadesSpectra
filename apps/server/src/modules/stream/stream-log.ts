import type {
	ClientMessage,
	ServerMessage,
	SignalSample,
} from "@repo/protocol";

export type PrintLine = (line: string) => void;

type StartMessage = Extract<ClientMessage, { type: "start" }>;
type SignalMessage = Extract<ServerMessage, { type: "signal" }>;

/** What one measurement session says in the server console, so a person can see why a signal does not come. */
export interface StreamLog {
	started(message: StartMessage): void;
	sent(message: ServerMessage): void;
	/** Prints the summary once; the client may stop the session and close the socket after it. */
	stopped(): void;
}

export const printToConsole: PrintLine = (line) => console.log(line);

function secondsSince(startedAtMs: number, nowMs: number): string {
	return ((nowMs - startedAtMs) / 1000).toFixed(1);
}

/** The pulse carries a confidence and the SDK's verdict; the other signals carry neither. */
function vitalOf({ sample }: SignalMessage): {
	label: string;
	confidence: number;
	stable: boolean;
} | null {
	if (sample.signal === "pulse") {
		const { bpm, confidence, stable } = (sample as SignalSample<"pulse">).value;
		return { label: `pulse ${Math.round(bpm)} bpm`, confidence, stable };
	}
	return null;
}

function describeSample(message: SignalMessage): string {
	const vital = vitalOf(message);
	if (!vital) return message.sample.signal;
	const verdict = vital.stable ? "stable" : "not stable";
	return `${vital.label} (confidence ${Math.round(vital.confidence)}, ${verdict})`;
}

function describeProblem(message: ServerMessage): string | null {
	if (message.type === "validation")
		return message.code === 0
			? "validation ok"
			: `validation ${message.code}: ${message.hint}`;
	if (message.type === "error")
		return `error: ${message.message}${message.retryable ? " (retryable)" : ""}`;
	return null;
}

export function createStreamLog(
	print: PrintLine,
	now: () => number = Date.now,
): StreamLog {
	let startedAtMs = now();
	let isOpen = false;
	const sampleCounts = new Map<string, number>();
	const lastStability = new Map<string, boolean | null>();

	const say = (text: string) =>
		print(`[stream ${secondsSince(startedAtMs, now())} s] ${text}`);

	const sayAboutSample = (message: SignalMessage) => {
		const { signal } = message.sample;
		const count = (sampleCounts.get(signal) ?? 0) + 1;
		sampleCounts.set(signal, count);
		const stability = vitalOf(message)?.stable ?? null;
		const isChanged = count === 1 || lastStability.get(signal) !== stability;
		lastStability.set(signal, stability);
		if (isChanged) say(describeSample(message));
	};

	return {
		started(message) {
			startedAtMs = now();
			isOpen = true;
			sampleCounts.clear();
			lastStability.clear();
			const signals = message.signals?.join(", ") || "none";
			say(
				`start ${message.width}x${message.height}, signals: ${signals}${message.debug ? ", debug" : ""}`,
			);
		},
		sent(message) {
			if (!isOpen) return;
			if (message.type === "ready") say("ready (the face is found)");
			else if (message.type === "signal") sayAboutSample(message);
			else {
				const line = describeProblem(message);
				if (line) say(line);
			}
		},
		stopped() {
			if (!isOpen) return;
			isOpen = false;
			const counts = [...sampleCounts].map(
				([signal, count]) => `${signal} ${count}`,
			);
			say(`stop, samples: ${counts.join(", ") || "none"}`);
		},
	};
}
