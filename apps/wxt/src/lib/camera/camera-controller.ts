import type { CameraEvent } from "./camera-events";

/** Opens and closes the place where the camera runs (offscreen document or tab). */
export interface CameraHost {
	open(): Promise<void>;
	close(): Promise<void>;
}

export interface CameraController {
	/** Starts the camera for `owner`; shares it when it already runs for someone else. */
	acquire(owner: string): Promise<void>;
	/** Stops the camera once its last owner is gone. */
	release(owner: string): Promise<void>;
	/** Closes and opens the camera again for the same owners, e.g. to start a session with other signals. */
	restart(): Promise<void>;
	/** The server already sent `ready` for the running camera. */
	isReady(): boolean;
	/** First owner, for the popup. */
	currentOwner(): string | null;
	/** Whether `owner` holds the camera now, shared or not. */
	hasOwner(owner: string): boolean;
	subscribe(listener: (event: CameraEvent) => void): () => void;
	/** Entry for events coming from the camera page. */
	handleEvent(event: CameraEvent): void;
}

export function createCameraController(host: CameraHost): CameraController {
	const owners: string[] = [];
	const listeners = new Set<(event: CameraEvent) => void>();
	let ready = false;
	let queue: Promise<unknown> = Promise.resolve();

	/** Open and close calls never overlap, otherwise a quick release/acquire pair would race. */
	const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
		const result = queue.then(task);
		queue = result.catch(() => {});
		return result;
	};

	const acquire = (owner: string) =>
		enqueue(async () => {
			if (owners.includes(owner)) return;
			const isFirstOwner = owners.length === 0;
			owners.push(owner);
			if (!isFirstOwner) return;
			ready = false;
			try {
				await host.open();
			} catch (error) {
				owners.length = 0;
				throw error;
			}
		});

	const release = (owner: string) =>
		enqueue(async () => {
			const index = owners.indexOf(owner);
			if (index === -1) return;
			owners.splice(index, 1);
			if (owners.length > 0) return;
			ready = false;
			await host.close();
		});

	const restart = () =>
		enqueue(async () => {
			if (owners.length === 0) return;
			ready = false;
			await host.close();
			await host.open();
		});

	const dropEverything = () => {
		if (owners.length === 0) return;
		owners.length = 0;
		ready = false;
		void enqueue(() => host.close());
	};

	return {
		acquire,
		release,
		restart,
		isReady: () => ready,
		currentOwner: () => owners[0] ?? null,
		hasOwner: (owner) => owners.includes(owner),
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		handleEvent(event) {
			if (event.kind === "server" && event.message.type === "ready")
				ready = true;
			if (event.kind === "failed" || event.kind === "lost") dropEverything();
			for (const listener of listeners) listener(event);
		},
	};
}
