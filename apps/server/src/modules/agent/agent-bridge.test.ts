import { describe, expect, test } from "bun:test";
import {
	agentToolNames,
	BRIDGE_CLOSE_REPLACED,
	BRIDGE_CLOSE_REVOKED,
	type BridgeRequest,
} from "@repo/protocol";
import { type BridgeSocket, createAgentBridge } from "./agent-bridge";

const TOKEN = "a".repeat(48);
const OTHER_TOKEN = "b".repeat(48);

interface FakePage extends BridgeSocket {
	sent: string[];
	closedWith: number | null;
}

function createFakePage(): FakePage {
	const page: FakePage = {
		sent: [],
		closedWith: null,
		send: (text) => void page.sent.push(text),
		close: (code) => {
			page.closedWith = code;
		},
	};
	return page;
}

function lastRequest(page: FakePage): BridgeRequest {
	return JSON.parse(page.sent.at(-1) ?? "{}") as BridgeRequest;
}

describe("agent bridge", () => {
	test("a call reaches the page and resolves with the page's answer", async () => {
		const bridge = createAgentBridge();
		const page = createFakePage();
		bridge.attach(TOKEN, page);

		const call = bridge.call(TOKEN, agentToolNames.list, {}, 1000);
		await Promise.resolve();
		const request = lastRequest(page);
		bridge.receive(
			page,
			JSON.stringify({ id: request.id, ok: true, result: [] }),
		);

		expect(request.name).toBe(agentToolNames.list);
		expect(await call).toEqual({ id: request.id, ok: true, result: [] });
	});

	test("without a connected page the agent gets an instruction, not a hang", async () => {
		const bridge = createAgentBridge();

		const response = await bridge.call(TOKEN, agentToolNames.list, {}, 1000);

		expect(response.ok).toBe(false);
		expect(response.ok === false && response.error).toContain(
			"Expose to agents",
		);
	});

	test("a newer page replaces the older one and the older one's calls fail", async () => {
		const bridge = createAgentBridge();
		const older = createFakePage();
		const newer = createFakePage();
		bridge.attach(TOKEN, older);
		const call = bridge.call(TOKEN, agentToolNames.list, {}, 1000);
		await Promise.resolve();

		bridge.attach(TOKEN, newer);

		expect(older.closedWith).toBe(BRIDGE_CLOSE_REPLACED);
		expect((await call).ok).toBe(false);
		expect(bridge.isExposed(TOKEN)).toBe(true);
	});

	test("a call in flight fails when the page disconnects", async () => {
		const bridge = createAgentBridge();
		const page = createFakePage();
		bridge.attach(TOKEN, page);
		const call = bridge.call(TOKEN, agentToolNames.list, {}, 1000);
		await Promise.resolve();

		bridge.detach(page);

		expect((await call).ok).toBe(false);
		expect(bridge.isExposed(TOKEN)).toBe(false);
	});

	test("turning the toggle off keeps the URL known; regenerating it revokes the URL", () => {
		const bridge = createAgentBridge();
		const toggledOff = createFakePage();
		const regenerated = createFakePage();
		bridge.attach(TOKEN, toggledOff);
		bridge.attach(OTHER_TOKEN, regenerated);

		bridge.detach(toggledOff, 1000);
		bridge.detach(regenerated, BRIDGE_CLOSE_REVOKED);

		expect(bridge.isKnown(TOKEN)).toBe(true);
		expect(bridge.isExposed(TOKEN)).toBe(false);
		expect(bridge.isKnown(OTHER_TOKEN)).toBe(false);
	});

	test("an unanswered call times out with a readable error", async () => {
		const bridge = createAgentBridge();
		bridge.attach(TOKEN, createFakePage());

		const response = await bridge.call(TOKEN, agentToolNames.list, {}, 20);

		expect(response.ok).toBe(false);
		expect(response.ok === false && response.error).toContain("did not answer");
	});
});
