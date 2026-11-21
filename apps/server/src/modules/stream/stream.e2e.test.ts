import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { FRAME_HEADER_BYTES, type ServerMessage } from "@repo/protocol";
import { Elysia } from "elysia";
import type { SessionWorker } from "./stream-session";
import type { WorkerInput, WorkerOutput } from "./worker-protocol";

process.env.SMARTSPECTRA_API_KEY = "test-key";
const { createStreamRoutes } = await import("./stream-routes");

const WIDTH = 4;
const HEIGHT = 4;
const FRAME_BYTES = FRAME_HEADER_BYTES + WIDTH * HEIGHT * 4;

interface FakeWorker extends SessionWorker {
	startInputs: WorkerInput[];
	maskInputs: boolean[];
	framesReceived: Array<{ timestampUs: number; byteLength: number }>;
	stopped: Promise<void>;
}

/** Stands in for the SDK worker: same messages, no SDK, no camera. */
function createFakeWorker(startsWith: WorkerOutput = { type: "started" }) {
	let markStopped: () => void = () => {};
	const worker: FakeWorker = {
		startInputs: [],
		maskInputs: [],
		framesReceived: [],
		stopped: new Promise<void>((resolve) => {
			markStopped = resolve;
		}),
		onmessage: null,
		onerror: null,
		terminate: () => markStopped(),
		postMessage(input: WorkerInput) {
			reply(input);
		},
	};

	let isReadySent = false;
	const emit = (output: WorkerOutput) =>
		setTimeout(() => {
			const deliver = worker.onmessage as unknown as
				| ((event: { data: WorkerOutput }) => void)
				| null;
			deliver?.({ data: output });
		}, 0);

	function reply(input: WorkerInput) {
		if (input.type === "start") {
			worker.startInputs.push(input);
			emit(startsWith);
		}
		if (input.type === "mask") worker.maskInputs.push(input.enabled);
		if (input.type === "stop") emit({ type: "stopped" });
		if (input.type !== "frame") return;

		worker.framesReceived.push({
			timestampUs: input.timestampUs,
			byteLength: input.pixels.byteLength,
		});
		emit({ type: "frame-processed" });
		if (isReadySent) return;
		isReadySent = true;
		emit({ type: "ready" });
	}
	return worker;
}

let nextWorkers: FakeWorker[] = [];
const server = new Elysia()
	.use(
		createStreamRoutes({
			createWorker: () => {
				const worker = nextWorkers.shift();
				if (!worker) throw new Error("test did not prepare a worker");
				return worker;
			},
		}),
	)
	.listen(0);

const openClients: Client[] = [];

afterAll(() => server.stop(true));

/** A failed test must not leave a session open: the SDK allows one per process. */
afterEach(async () => {
	for (const client of openClients.splice(0)) client.socket.close();
	await Bun.sleep(50);
});

function buildFrame(timestampUs: number): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(new ArrayBuffer(FRAME_BYTES));
	new DataView(bytes.buffer).setBigUint64(0, BigInt(timestampUs), true);
	return bytes;
}

interface Client {
	messages: ServerMessage[];
	socket: WebSocket;
	next(type: ServerMessage["type"]): Promise<ServerMessage>;
	start(debug?: boolean, signals?: string[]): void;
	sendFramesUntil(type: ServerMessage["type"]): Promise<ServerMessage>;
}

async function connect(): Promise<Client> {
	const socket = new WebSocket(`ws://localhost:${server.server?.port}/ws`);
	socket.binaryType = "arraybuffer";
	const messages: ServerMessage[] = [];
	socket.onmessage = (event) =>
		messages.push(JSON.parse(String(event.data)) as ServerMessage);
	await new Promise((resolve) => {
		socket.onopen = resolve;
	});

	const waitFor = async (type: ServerMessage["type"]) => {
		for (let attempt = 0; attempt < 200; attempt++) {
			const found = messages.find((message) => message.type === type);
			if (found) return found;
			await Bun.sleep(10);
		}
		throw new Error(`no "${type}" message arrived`);
	};

	const client: Client = {
		messages,
		socket,
		next: waitFor,
		start: (debug, signals) =>
			socket.send(
				JSON.stringify({
					type: "start",
					width: WIDTH,
					height: HEIGHT,
					debug,
					signals,
				}),
			),
		async sendFramesUntil(type) {
			let timestampUs = 1000;
			for (let attempt = 0; attempt < 200; attempt++) {
				const found = messages.find((message) => message.type === type);
				if (found) return found;
				socket.send(buildFrame(timestampUs));
				timestampUs += 33_000;
				await Bun.sleep(10);
			}
			throw new Error(`no "${type}" message arrived`);
		},
	};
	openClients.push(client);
	return client;
}

describe("measurement stream over WebSocket", () => {
	test("start, frames and ready: the client is told when measuring begins", async () => {
		const worker = createFakeWorker();
		nextWorkers = [worker];
		const client = await connect();

		client.start();
		await client.sendFramesUntil("ready");

		const frame = worker.framesReceived[0];
		expect(frame?.byteLength).toBe(WIDTH * HEIGHT * 4);
		expect(((frame?.timestampUs ?? 0) - 1000) % 33_000).toBe(0);
		client.socket.send(JSON.stringify({ type: "stop" }));
		await worker.stopped;
	});

	test("a mask message sent right after start reaches the worker once the session is open", async () => {
		const worker = createFakeWorker();
		nextWorkers = [worker];
		const client = await connect();

		client.start();
		client.socket.send(JSON.stringify({ type: "mask", enabled: true }));
		await client.sendFramesUntil("ready");
		await Bun.sleep(30);
		expect(worker.maskInputs).toEqual([true]);

		client.socket.send(JSON.stringify({ type: "mask", enabled: false }));
		await Bun.sleep(30);
		expect(worker.maskInputs).toEqual([true, false]);
		client.socket.send(JSON.stringify({ type: "stop" }));
		await worker.stopped;
	});

	test("a client that asks for debug gets the worker told so, and receives the raw metrics it sends", async () => {
		const worker = createFakeWorker({ type: "started" });
		nextWorkers = [worker];
		const client = await connect();

		client.start(true);
		await client.sendFramesUntil("ready");
		const deliver = worker.onmessage as unknown as (event: {
			data: WorkerOutput;
		}) => void;
		deliver({ data: { type: "metrics", metrics: { face: { talking: [] } } } });
		const raw = await client.next("metrics");

		expect(worker.startInputs[0]).toEqual({ type: "start", debug: true });
		expect(raw).toEqual({
			type: "metrics",
			metrics: { face: { talking: [] } },
		});
		client.socket.send(JSON.stringify({ type: "stop" }));
		await worker.stopped;
	});

	test("the requested signals reach the worker and its signal samples reach the client", async () => {
		const worker = createFakeWorker();
		nextWorkers = [worker];
		const client = await connect();

		client.start(false, ["pulse", "blink"]);
		await client.sendFramesUntil("ready");
		const deliver = worker.onmessage as unknown as (event: {
			data: WorkerOutput;
		}) => void;
		const sample = {
			signal: "pulse",
			value: { bpm: 70, confidence: 80, stable: true },
			at: 1000,
		} as const;
		deliver({ data: { type: "signal", sample } });

		expect(worker.startInputs[0]).toMatchObject({
			signals: ["pulse", "blink"],
		});
		expect(await client.next("signal")).toEqual({ type: "signal", sample });
		client.socket.send(JSON.stringify({ type: "stop" }));
		await worker.stopped;
	});

	test("a start with an unknown signal is rejected and starts nothing", async () => {
		const worker = createFakeWorker();
		nextWorkers = [worker];
		const client = await connect();

		client.start(false, ["gaze"]);
		expect(await client.next("error")).toMatchObject({
			message: "Malformed message",
		});
		expect(worker.startInputs).toHaveLength(0);
		nextWorkers = [];
		client.socket.close();
	});

	test("a second client is told to retry while the first one measures", async () => {
		const worker = createFakeWorker();
		nextWorkers = [worker];
		const first = await connect();
		first.start();
		await first.sendFramesUntil("ready");

		const second = await connect();
		second.start();
		const error = await second.next("error");
		expect(error).toMatchObject({ type: "error", retryable: true });

		first.socket.send(JSON.stringify({ type: "stop" }));
		await worker.stopped;
	});

	test("a client that disconnects without stop frees the session", async () => {
		const firstWorker = createFakeWorker();
		nextWorkers = [firstWorker];
		const first = await connect();
		first.start();
		await first.sendFramesUntil("ready");

		first.socket.close();
		await firstWorker.stopped;

		const secondWorker = createFakeWorker();
		nextWorkers = [secondWorker];
		const second = await connect();
		second.start();
		await second.sendFramesUntil("ready");
		second.socket.send(JSON.stringify({ type: "stop" }));
		await secondWorker.stopped;
	});

	test("an SDK that fails to start reports the error and does not block the next start", async () => {
		nextWorkers = [
			createFakeWorker({
				type: "error",
				message: "no camera frames accepted",
				retryable: true,
			}),
		];
		const failing = await connect();
		failing.start();
		expect(await failing.next("error")).toMatchObject({
			message: "no camera frames accepted",
			retryable: true,
		});

		const worker = createFakeWorker();
		nextWorkers = [worker];
		const retry = await connect();
		retry.start();
		await retry.sendFramesUntil("ready");
		retry.socket.send(JSON.stringify({ type: "stop" }));
		await worker.stopped;
	});

	test("a malformed message gets an error and the connection stays usable", async () => {
		const client = await connect();
		client.socket.send("definitely not a client message");
		expect(await client.next("error")).toMatchObject({
			type: "error",
			retryable: false,
		});
		expect(client.socket.readyState).toBe(WebSocket.OPEN);
		client.socket.close();
	});
});
