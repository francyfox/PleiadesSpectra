import type { ServerMessage, SignalName } from "@repo/protocol";

/** Main thread → SDK worker. Frames carry their pixels as a transferred ArrayBuffer. */
export type WorkerInput =
	| { type: "start"; debug?: boolean; signals?: SignalName[] }
	| {
			type: "frame";
			timestampUs: number;
			width: number;
			height: number;
			pixels: ArrayBuffer;
	  }
	| { type: "mask"; enabled: boolean }
	| { type: "stop" };

/** SDK worker → main thread. `ServerMessage`s are forwarded to the client as they are. */
export type WorkerOutput =
	| ServerMessage
	| { type: "started" }
	| { type: "frame-processed" }
	| { type: "stopped" };
