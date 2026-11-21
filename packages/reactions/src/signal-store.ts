import {
	isSignalName,
	SIGNAL_EVENT_NAME,
	type SignalName,
	type SignalSample,
	type SignalValues,
	signalNames,
} from "@repo/protocol";
import type { RuntimeEnvironment } from "./environment";
import { checkSignal } from "./permissions";
import type {
	NumericSignalField,
	SignalHistoryOptions,
	SignalsApi,
} from "./types";

/** Samples older than this (by `sample.at`, against `environment.now`) are dropped. */
export const MAX_HISTORY_AGE_MS = 60_000;

/** At most this many samples are kept per signal; the oldest go first. */
export const MAX_HISTORY_SAMPLES = 2_000;

export type Disposer = () => void;

export interface SignalStore {
	push(sample: SignalSample): void;
	api: SignalsApi;
}

function isSignalSample(value: unknown): value is SignalSample {
	if (typeof value !== "object" || value === null) return false;
	const { signal, value: sampleValue, at } = value as Partial<SignalSample>;
	return (
		isSignalName(signal) &&
		typeof sampleValue === "object" &&
		sampleValue !== null &&
		typeof at === "number"
	);
}

/** The detail may cross the content-script boundary as a JSON string. */
function readSignalDetail(event: Event): SignalSample | null {
	const { detail } = event as CustomEvent<unknown>;
	try {
		const parsed = typeof detail === "string" ? JSON.parse(detail) : detail;
		return isSignalSample(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/** Calls `onSample` for every signal sample the extension delivers to the page. */
export function watchSignals(
	environment: RuntimeEnvironment,
	onSample: (sample: SignalSample) => void,
): Disposer {
	const listener = (event: Event) => {
		const sample = readSignalDetail(event);
		if (sample && checkSignal(environment, sample.signal)) onSample(sample);
	};
	environment.window.addEventListener(SIGNAL_EVENT_NAME, listener);
	return () =>
		environment.window.removeEventListener(SIGNAL_EVENT_NAME, listener);
}

function createBuckets(): Map<SignalName, SignalSample[]> {
	return new Map(signalNames.map((name) => [name, []]));
}

function countRisingEdges(samples: SignalSample<"blink">[], since: number) {
	let count = 0;
	for (const [index, sample] of samples.entries()) {
		const previous = samples[index - 1];
		const isRising =
			sample.value.detected && previous?.value.detected === false;
		if (isRising && sample.at >= since) count++;
	}
	return count;
}

/** The history of every signal; it is filled by `push` and read through `api`. */
export function createSignalStore(
	environment: RuntimeEnvironment,
): SignalStore {
	const buckets = createBuckets();

	const bucketOf = <Name extends SignalName>(name: Name) =>
		(buckets.get(name) ?? []) as SignalSample<Name>[];

	const since = (withinMs: number | undefined) =>
		withinMs === undefined
			? Number.NEGATIVE_INFINITY
			: environment.now() - withinMs;

	const history = <Name extends SignalName>(
		name: Name,
		options?: SignalHistoryOptions,
	) => {
		const from = since(options?.withinMs);
		return bucketOf(name).filter((sample) => sample.at >= from);
	};

	const push = (sample: SignalSample) => {
		const bucket = bucketOf(sample.signal);
		bucket.push(sample);
		const oldest = environment.now() - MAX_HISTORY_AGE_MS;
		const firstAlive = bucket.findIndex((item) => item.at >= oldest);
		const dropByAge = firstAlive === -1 ? bucket.length : firstAlive;
		const dropByCount = Math.max(0, bucket.length - MAX_HISTORY_SAMPLES);
		bucket.splice(0, Math.max(dropByAge, dropByCount));
	};

	const api: SignalsApi = {
		latest: (name) => bucketOf(name).at(-1),
		history,
		blinks: (withinMs) => countRisingEdges(bucketOf("blink"), since(withinMs)),
		poseChange: (withinMs) => {
			const poses = history("pose", { withinMs });
			const first = poses.at(0)?.value;
			const last = poses.at(-1)?.value;
			if (!first || !last) return { yaw: 0, pitch: 0 };
			return { yaw: last.yaw - first.yaw, pitch: last.pitch - first.pitch };
		},
		average: (name, field, withinMs) => {
			const values = history(name, { withinMs })
				.map((sample) => readNumber(sample.value, field))
				.filter((value) => value !== undefined);
			if (values.length === 0) return undefined;
			return values.reduce((sum, value) => sum + value, 0) / values.length;
		},
	};

	return { push, api };
}

function readNumber<Name extends SignalName>(
	value: SignalValues[Name],
	field: NumericSignalField<Name>,
): number | undefined {
	const read = (value as Record<string, unknown>)[field as string];
	return typeof read === "number" ? read : undefined;
}

/** Reads of a signal the script did not declare return nothing and warn once. */
export function guardSignalsApi(
	api: SignalsApi,
	environment: RuntimeEnvironment,
): SignalsApi {
	const allowed = (name: SignalName) => checkSignal(environment, name);
	return {
		latest: (name) => (allowed(name) ? api.latest(name) : undefined),
		history: (name, options) =>
			allowed(name) ? api.history(name, options) : [],
		blinks: (withinMs) => (allowed("blink") ? api.blinks(withinMs) : 0),
		poseChange: (withinMs) =>
			allowed("pose") ? api.poseChange(withinMs) : { yaw: 0, pitch: 0 },
		average: (name, field, withinMs) =>
			allowed(name) ? api.average(name, field, withinMs) : undefined,
	};
}

const storesByWindow = new WeakMap<object, SignalStore>();

/**
 * One store per page window, so every reaction of the page sees the same history. It starts listening the
 * first time it is asked for and keeps listening for the life of the page.
 */
export function getSignalStore(environment: RuntimeEnvironment): SignalStore {
	const existing = storesByWindow.get(environment.window);
	if (existing) return existing;
	const store = createSignalStore(environment);
	watchSignals(environment, store.push);
	storesByWindow.set(environment.window, store);
	return store;
}
