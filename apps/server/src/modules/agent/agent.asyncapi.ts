import {
	type JsonObject,
	messageOf,
	operationOf,
	ref,
	toPlainSchema,
} from "#modules/docs/asyncapi.utils";
import { AGENT_CHANNEL_DESCRIPTION } from "./agent.docs";
import {
	bridgeHeaders,
	bridgeRequestFrame,
	bridgeResponseFrame,
	tokenParams,
} from "./agent.schemas";

const AGENT_TAG = "agent";
const CHANNEL = "agent";

const pingSchema = {
	type: "string",
	const: "ping",
	description: "Heartbeat the page sends every 20 s.",
};

const pongSchema = {
	type: "string",
	const: "pong",
	description: "The server's answer to `ping`.",
};

/** The `examples` array a TypeBox schema carries, as AsyncAPI message examples. */
function examplesOf(schema: object, summaries: string[]): JsonObject[] {
	const { examples = [] } = toPlainSchema(schema) as { examples?: unknown[] };
	return examples.map((payload, index) => ({
		name: `example${index + 1}`,
		summary: summaries[index],
		payload,
	}));
}

interface MessageSpec {
	key: string;
	componentName: string;
	title: string;
	summary: string;
	contentType: string;
	schema: object;
	examples: JsonObject[];
}

const bridgeRequest: MessageSpec = {
	key: "bridgeRequest",
	componentName: "AgentBridgeRequest",
	title: "Tool call (server to page)",
	summary: "An MCP tool the Scripts page has to run.",
	contentType: "application/json",
	schema: bridgeRequestFrame,
	examples: examplesOf(bridgeRequestFrame, ["Read one installed script"]),
};

const bridgeResponse: MessageSpec = {
	key: "bridgeResponse",
	componentName: "AgentBridgeResponse",
	title: "Tool result (page to server)",
	summary: "The answer to a call, with the same `id`.",
	contentType: "application/json",
	schema: bridgeResponseFrame,
	examples: examplesOf(bridgeResponseFrame, ["Success", "Failure"]),
};

const ping: MessageSpec = {
	key: "ping",
	componentName: "AgentPing",
	title: "Ping (page to server)",
	summary: "Text heartbeat.",
	contentType: "text/plain",
	schema: pingSchema,
	examples: [{ name: "ping", payload: "ping" }],
};

const pong: MessageSpec = {
	key: "pong",
	componentName: "AgentPong",
	title: "Pong (server to page)",
	summary: "Text answer to the heartbeat.",
	contentType: "text/plain",
	schema: pongSchema,
	examples: [{ name: "pong", payload: "pong" }],
};

const allMessages = [bridgeRequest, bridgeResponse, ping, pong];

const tokenParameter = (
	toPlainSchema(tokenParams).properties as Record<string, JsonObject>
).token;

/** `channels.agent`: the `/agent/{token}` address, the token parameter, handshake headers and messages. */
export const agentChannel: JsonObject = {
	address: "/agent/{token}",
	title: "Extension bridge",
	summary:
		"Held open by the extension's Scripts page while it is exposed to agents.",
	description: AGENT_CHANNEL_DESCRIPTION,
	servers: [ref("servers/local")],
	tags: [{ name: AGENT_TAG }],
	parameters: {
		token: {
			description: tokenParameter?.description,
			examples: tokenParameter?.examples,
		},
	},
	bindings: {
		ws: {
			method: "GET",
			headers: toPlainSchema(bridgeHeaders),
			bindingVersion: "0.1.0",
		},
	},
	messages: Object.fromEntries(
		allMessages.map(({ key, componentName }) => [
			key,
			ref(`components/messages/${componentName}`),
		]),
	),
};

/** Operations of the agent channel; the server sends tool calls and answers pings. */
export const agentOperations: Record<string, JsonObject> = {
	sendBridgeRequest: operationOf({
		action: "send",
		channel: CHANNEL,
		message: "bridgeRequest",
		title: "Server sends: tool call",
		summary: bridgeRequest.summary,
		tag: AGENT_TAG,
	}),
	receiveBridgeResponse: operationOf({
		action: "receive",
		channel: CHANNEL,
		message: "bridgeResponse",
		title: "Page sends: tool result",
		summary: bridgeResponse.summary,
		tag: AGENT_TAG,
	}),
	receivePing: operationOf({
		action: "receive",
		channel: CHANNEL,
		message: "ping",
		title: "Page sends: ping",
		summary: ping.summary,
		tag: AGENT_TAG,
	}),
	sendPong: operationOf({
		action: "send",
		channel: CHANNEL,
		message: "pong",
		title: "Server sends: pong",
		summary: pong.summary,
		tag: AGENT_TAG,
	}),
};

/** `components.messages` of the agent channel. */
export const agentMessages: Record<string, JsonObject> = Object.fromEntries(
	allMessages.map((spec) => [
		spec.componentName,
		messageOf({ ...spec, schemaName: spec.componentName }),
	]),
);

/** `components.schemas` of the agent channel, reused from `agent.schemas.ts`. */
export const agentSchemas: Record<string, JsonObject> = Object.fromEntries(
	allMessages.map(({ componentName, schema }) => [
		componentName,
		toPlainSchema(schema),
	]),
);
