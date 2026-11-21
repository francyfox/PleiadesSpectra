import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GESTURE_EVENT_NAME, type PluginMessage } from "@repo/protocol";
import { Window } from "happy-dom";
import type { IntersectionWatcherFactory } from "../src/environment";
import {
	createReactionFactory,
	type RuntimeEnvironment,
	type ShowOptions,
} from "../src/index";

interface Harness {
	window: Window;
	/** The same window typed as the browser's, for DOM calls. */
	domWindow: typeof globalThis;
	document: Document;
	messages: PluginMessage[];
	setNow: (value: number) => void;
	reaction: ReturnType<typeof createReactionFactory>;
	respondWith: (answer: unknown) => void;
	/** Stands in for the browser's IntersectionObserver: tells the runtime an element is in or out of the viewport. */
	reportIntersection: (element: Element, isIntersecting: boolean) => void;
	/** From now on the page can observe the viewport, so `onVisible` waits for it. */
	useViewport: () => void;
	/** The next question is never answered, like a user who has not decided yet. */
	holdAnswers: () => void;
	/** A single-page app changes the address without unloading the page. */
	navigate: (href: string) => void;
	/** From now on every message sent to the extension is rejected. */
	failTransport: () => void;
}

function createHarness(): Harness {
	const window = new Window();
	const messages: PluginMessage[] = [];
	let now = 0;
	let answer: unknown = "smile";
	let isHolding = false;
	let isFailing = false;
	const location = { href: "http://localhost/a" };

	const viewport = { enabled: false };
	let reportToRuntime: (element: Element, isIntersecting: boolean) => void =
		() => {};
	const createIntersectionWatcher: IntersectionWatcherFactory = (onChange) => {
		reportToRuntime = onChange;
		return { observe() {}, unobserve() {}, disconnect() {} };
	};

	const environment = {
		window,
		get createIntersectionWatcher() {
			return viewport.enabled ? createIntersectionWatcher : undefined;
		},
		document: window.document,
		location,
		transport: async (message: PluginMessage) => {
			messages.push(message);
			if (isFailing) throw new Error("extension is gone");
			if (isHolding && message.type === "reaction/ask")
				return new Promise(() => {});
			return answer;
		},
		now: () => now,
	} as unknown as RuntimeEnvironment;

	return {
		window,
		domWindow: window as unknown as typeof globalThis,
		document: window.document as unknown as Document,
		messages,
		setNow: (value) => {
			now = value;
		},
		reaction: createReactionFactory(() => environment),
		respondWith: (value) => {
			answer = value;
		},
		reportIntersection: (element, isIntersecting) =>
			reportToRuntime(element, isIntersecting),
		useViewport: () => {
			viewport.enabled = true;
		},
		holdAnswers: () => {
			isHolding = true;
		},
		navigate: (href) => {
			location.href = href;
		},
		failTransport: () => {
			isFailing = true;
		},
	};
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function addElement(harness: Harness, className: string): HTMLElement {
	const element = harness.document.createElement("div");
	element.className = className;
	harness.document.body.append(element);
	return element;
}

function dispatchGesture(harness: Harness, detail: unknown): void {
	harness.domWindow.dispatchEvent(
		new harness.domWindow.CustomEvent(GESTURE_EVENT_NAME, { detail }),
	);
}

let harness: Harness;
beforeEach(() => {
	harness = createHarness();
});
afterEach(async () => {
	await harness.window.happyDOM.close();
});

describe("onVisible and the viewport", () => {
	test("by default an element that is rendered but outside the viewport does not count yet", async () => {
		harness.useViewport();
		const modal = addElement(harness, "modal");
		let count = 0;
		harness.reaction("a").onVisible(".modal", () => {
			count += 1;
		});
		await tick();
		const beforeScrolling = count;

		harness.reportIntersection(modal, true);
		await tick();
		harness.reportIntersection(modal, false);
		await tick();
		harness.reportIntersection(modal, true);
		await tick();

		expect(beforeScrolling).toBe(0);
		expect(count).toBe(2);
	});

	test("with scope: false only rendering matters, so an element below the fold fires at once", async () => {
		harness.useViewport();
		addElement(harness, "modal");
		let count = 0;
		harness.reaction("a").onVisible(
			".modal",
			() => {
				count += 1;
			},
			{ scope: false },
		);
		await tick();

		expect(count).toBe(1);
	});

	test("a hidden element does not fire even when the browser says it intersects", async () => {
		harness.useViewport();
		const modal = addElement(harness, "modal");
		modal.setAttribute("hidden", "");
		let count = 0;
		harness.reaction("a").onVisible(".modal", () => {
			count += 1;
		});
		await tick();

		harness.reportIntersection(modal, true);
		await tick();

		expect(count).toBe(0);
	});
});

describe("onVisible", () => {
	test("fires for an element that is visible already, once", async () => {
		addElement(harness, "modal");
		let count = 0;
		harness.reaction("a").onVisible(".modal", () => {
			count += 1;
		});
		await tick();
		await tick();
		expect(count).toBe(1);
	});

	test("waits while the element is hidden and fires when a class makes it visible", async () => {
		const modal = addElement(harness, "modal closed");
		const style = harness.document.createElement("style");
		style.textContent = ".closed { display: none; }";
		harness.document.head.append(style);
		let count = 0;
		harness.reaction("a").onVisible(".modal", () => {
			count += 1;
		});
		await tick();
		const whileHidden = count;

		modal.classList.remove("closed");
		await tick();

		expect(whileHidden).toBe(0);
		expect(count).toBe(1);
	});

	test("is hidden by a hidden ancestor too, and fires again each time it shows", async () => {
		const wrapper = addElement(harness, "wrapper");
		const modal = harness.document.createElement("div");
		modal.className = "modal";
		wrapper.append(modal);
		wrapper.setAttribute("hidden", "");
		let count = 0;
		harness.reaction("a").onVisible(".modal", () => {
			count += 1;
		});
		await tick();
		const whileHidden = count;

		wrapper.removeAttribute("hidden");
		await tick();
		wrapper.setAttribute("hidden", "");
		await tick();
		wrapper.removeAttribute("hidden");
		await tick();

		expect(whileHidden).toBe(0);
		expect(count).toBe(2);
	});

	test("fires for an element that is inserted later", async () => {
		let count = 0;
		harness.reaction("a").onVisible(".modal", () => {
			count += 1;
		});
		await tick();

		addElement(harness, "modal");
		await tick();

		expect(count).toBe(1);
	});
});

describe("onEvent", () => {
	test("delegates a selector target and passes the matched element", async () => {
		const clicked: Array<Element | null> = [];
		harness.reaction("a").onEvent(".buy", "click", ({ element }) => {
			clicked.push(element);
		});
		await tick();

		const button = addElement(harness, "buy");
		button.dispatchEvent(
			new harness.domWindow.Event("click", { bubbles: true }),
		);
		await tick();

		expect(clicked).toEqual([button]);
	});
});

describe("onGesture", () => {
	test("runs only for its gesture and respects minConfidence", async () => {
		const seen: number[] = [];
		harness
			.reaction("a")
			.minConfidence(0.6)
			.onGesture("nod", ({ event }) => {
				seen.push(event.confidence);
			});
		await tick();

		dispatchGesture(harness, { gesture: "shake", confidence: 0.9 });
		dispatchGesture(harness, { gesture: "nod", confidence: 0.3 });
		dispatchGesture(harness, { gesture: "nod", confidence: 0.8 });
		await tick();

		expect(seen).toEqual([0.8]);
	});

	test("accepts a JSON string detail and ignores garbage", async () => {
		let count = 0;
		harness.reaction("a").onGesture("smile", () => {
			count += 1;
		});
		await tick();

		dispatchGesture(
			harness,
			JSON.stringify({ gesture: "smile", confidence: 1 }),
		);
		dispatchGesture(harness, "not json");
		dispatchGesture(harness, null);
		await tick();

		expect(count).toBe(1);
	});

	test("cooldown applies to triggers declared after it", async () => {
		let count = 0;
		harness
			.reaction("a")
			.cooldown(400)
			.onGesture("tilt-down", () => {
				count += 1;
			});
		await tick();

		const detail = { gesture: "tilt-down", confidence: 1 };
		harness.setNow(1000);
		dispatchGesture(harness, detail);
		harness.setNow(1200);
		dispatchGesture(harness, detail);
		harness.setNow(1500);
		dispatchGesture(harness, detail);
		await tick();

		expect(count).toBe(2);
	});
});

describe("use", () => {
	test("adopts the rules of another reaction and applies script functions", async () => {
		const calls: string[] = [];
		const shared = harness.reaction("shared").onGesture("nod", () => {
			calls.push("shared");
		});
		harness
			.reaction("main")
			.use(shared)
			.use((chain) =>
				chain.onGesture("shake", () => {
					calls.push("plugin");
				}),
			);
		await tick();

		dispatchGesture(harness, { gesture: "nod", confidence: 1 });
		dispatchGesture(harness, { gesture: "shake", confidence: 1 });
		await tick();

		expect(calls).toEqual(["shared", "plugin"]);
	});
});

describe("context", () => {
	test("ask sends the expected message and returns the answer", async () => {
		let answer: unknown;
		harness.reaction("rating").onGesture("talking", async (context) => {
			answer = await context.ask("How was it?", {
				expect: ["smile", "confused"],
				labels: { confused: "So-so" },
			});
		});
		await tick();

		dispatchGesture(harness, { gesture: "talking", confidence: 1 });
		await tick();

		expect(harness.messages).toEqual([
			{
				type: "reaction/ask",
				pluginName: "rating",
				question: "How was it?",
				options: [
					{ value: "smile", label: "Good", gestureLabel: "🙂 smile" },
					{ value: "confused", label: "So-so", gestureLabel: "🤔 confused" },
				],
				timeoutMs: 8000,
			},
		]);
		expect(answer).toBe("smile");
	});

	test("ask resolves with timeout when the answer is not a gesture", async () => {
		harness.respondWith("garbage");
		let answer: unknown;
		harness.reaction("a").onGesture("nod", async (context) => {
			answer = await context.ask("?", { expect: ["nod"] });
		});
		await tick();
		dispatchGesture(harness, { gesture: "nod", confidence: 1 });
		await tick();
		expect(answer).toBe("timeout");
	});
});

describe("a question outlives neither the page nor its trigger", () => {
	function startQuestion(onAnswer: (answer: unknown) => void): HTMLElement {
		const modal = addElement(harness, "modal");
		harness.holdAnswers();
		harness.reaction("a").onVisible(
			".modal",
			async (ctx) => {
				onAnswer(await ctx.ask("Rate us?", { expect: ["smile"] }));
			},
			{ scope: false },
		);
		return modal;
	}

	test("a single-page route change drops the question and tells the extension", async () => {
		const answers: unknown[] = [];
		startQuestion((answer) => answers.push(answer));
		await tick();

		harness.navigate("http://localhost/b");
		harness.domWindow.dispatchEvent(new harness.domWindow.Event("popstate"));
		await tick();

		expect(answers).toEqual(["timeout"]);
		expect(harness.messages.map((message) => message.type)).toEqual([
			"reaction/ask",
			"reaction/cancel-ask",
		]);
	});

	test("removing the element that started the question drops it too", async () => {
		const answers: unknown[] = [];
		const modal = startQuestion((answer) => answers.push(answer));
		await tick();

		modal.remove();
		await new Promise((resolve) => setTimeout(resolve, 350));

		expect(answers).toEqual(["timeout"]);
		expect(harness.messages.at(-1)?.type).toBe("reaction/cancel-ask");
	});

	test("an answered question leaves nothing behind", async () => {
		const answers: unknown[] = [];
		addElement(harness, "modal");
		harness.reaction("a").onVisible(
			".modal",
			async (ctx) => {
				answers.push(await ctx.ask("Rate us?", { expect: ["smile"] }));
			},
			{ scope: false },
		);
		await tick();
		await tick();

		harness.navigate("http://localhost/b");
		harness.domWindow.dispatchEvent(new harness.domWindow.Event("popstate"));
		await new Promise((resolve) => setTimeout(resolve, 300));

		expect(answers).toEqual(["smile"]);
		expect(harness.messages.map((message) => message.type)).toEqual([
			"reaction/ask",
		]);
	});
});

describe("removing triggers", () => {
	test("stop() in the same tick as the chain keeps the reaction from ever starting", async () => {
		addElement(harness, "modal");
		let count = 0;
		const reaction = harness.reaction("a").onVisible(
			".modal",
			() => {
				count += 1;
			},
			{ scope: false },
		);

		reaction.stop();
		await tick();

		expect(count).toBe(0);
	});

	test("stop() later removes every trigger", async () => {
		let clicks = 0;
		const reaction = harness.reaction("a").onEvent(".buy", "click", () => {
			clicks += 1;
		});
		await tick();
		const button = addElement(harness, "buy");
		const click = () =>
			button.dispatchEvent(
				new harness.domWindow.Event("click", { bubbles: true }),
			);

		click();
		await tick();
		reaction.stop();
		click();
		await tick();

		expect(clicks).toBe(1);
	});

	test("ctx.cancel() removes only the trigger that fired", async () => {
		const seen: string[] = [];
		harness
			.reaction("a")
			.onEvent(".buy", "click", (ctx) => {
				seen.push("buy");
				ctx.cancel();
			})
			.onEvent(".help", "click", () => {
				seen.push("help");
			});
		await tick();
		const buy = addElement(harness, "buy");
		const help = addElement(harness, "help");
		const click = (element: Element) =>
			element.dispatchEvent(
				new harness.domWindow.Event("click", { bubbles: true }),
			);

		click(buy);
		await tick();
		click(buy);
		click(help);
		click(help);
		await tick();

		expect(seen).toEqual(["buy", "help", "help"]);
	});

	test("a visible trigger that cancels does not fire again when the element shows once more", async () => {
		const modal = addElement(harness, "modal");
		let count = 0;
		harness.reaction("a").onVisible(
			".modal",
			(ctx) => {
				count += 1;
				ctx.cancel();
			},
			{ scope: false },
		);
		await tick();

		modal.setAttribute("hidden", "");
		await tick();
		modal.removeAttribute("hidden");
		await tick();

		expect(count).toBe(1);
	});
});

describe("an AbortSignal removes a whole reaction", () => {
	const click = (element: Element) =>
		element.dispatchEvent(
			new harness.domWindow.Event("click", { bubbles: true }),
		);

	test("abort() removes every trigger of the reaction", async () => {
		const controller = new AbortController();
		let clicks = 0;
		harness
			.reaction("a", { signal: controller.signal })
			.onEvent(".buy", "click", () => {
				clicks += 1;
			});
		await tick();
		const button = addElement(harness, "buy");

		click(button);
		await tick();
		controller.abort();
		click(button);
		await tick();

		expect(clicks).toBe(1);
	});

	test("a signal that is aborted already keeps the reaction from starting", async () => {
		const controller = new AbortController();
		controller.abort();
		addElement(harness, "modal");
		let count = 0;
		harness.reaction("a", { signal: controller.signal }).onVisible(
			".modal",
			() => {
				count += 1;
			},
			{ scope: false },
		);

		await tick();

		expect(count).toBe(0);
	});

	test("aborting one controller leaves other reactions alone", async () => {
		const controller = new AbortController();
		let first = 0;
		let second = 0;
		harness
			.reaction("first", { signal: controller.signal })
			.onEvent(".buy", "click", () => {
				first += 1;
			});
		harness.reaction("second").onEvent(".buy", "click", () => {
			second += 1;
		});
		await tick();
		const button = addElement(harness, "buy");

		controller.abort();
		click(button);
		await tick();

		expect(first).toBe(0);
		expect(second).toBe(1);
	});
});

describe("subscriptions made inside a handler", () => {
	const click = (element: Element) =>
		element.dispatchEvent(
			new harness.domWindow.Event("click", { bubbles: true }),
		);

	test("ctx.onGesture listens while the element is visible and stops when it hides", async () => {
		const modal = addElement(harness, "modal");
		const seen: string[] = [];
		harness.reaction("a").onVisible(
			".modal",
			(ctx) => {
				ctx.onGesture("nod", ({ event }) => {
					seen.push(event.gesture);
				});
			},
			{ scope: false },
		);
		await tick();

		dispatchGesture(harness, { gesture: "nod", confidence: 0.9 });
		dispatchGesture(harness, { gesture: "shake", confidence: 0.9 });
		await tick();
		modal.setAttribute("hidden", "");
		await new Promise((resolve) => setTimeout(resolve, 350));
		dispatchGesture(harness, { gesture: "nod", confidence: 0.9 });
		await tick();

		expect(seen).toEqual(["nod"]);
	});

	test("ctx.onEvent is removed with the element and keeps the matched element", async () => {
		const modal = addElement(harness, "modal");
		const seen: Array<Element | null> = [];
		harness.reaction("a").onVisible(
			".modal",
			(ctx) => {
				ctx.onEvent(".close", "click", ({ element }) => {
					seen.push(element);
				});
			},
			{ scope: false },
		);
		const close = harness.document.createElement("button");
		close.className = "close";
		modal.append(close);
		await tick();

		click(close);
		modal.remove();
		await new Promise((resolve) => setTimeout(resolve, 350));
		harness.document.body.append(close);
		click(close);
		await tick();

		expect(seen).toEqual([close]);
	});

	test("the limits of the reaction apply to a subscription", async () => {
		addElement(harness, "modal");
		const seen: number[] = [];
		harness
			.reaction("a")
			.minConfidence(0.6)
			.onVisible(
				".modal",
				(ctx) => {
					ctx.onGesture("nod", ({ event }) => {
						seen.push(event.confidence);
					});
				},
				{ scope: false },
			);
		await tick();

		dispatchGesture(harness, { gesture: "nod", confidence: 0.3 });
		dispatchGesture(harness, { gesture: "nod", confidence: 0.8 });
		await tick();

		expect(seen).toEqual([0.8]);
	});

	test("the returned function removes the subscription early, and so does ctx.cancel() inside it", async () => {
		addElement(harness, "modal");
		const seen: string[] = [];
		harness.reaction("a").onVisible(
			".modal",
			(ctx) => {
				const off = ctx.onGesture("nod", () => {
					seen.push("nod");
				});
				ctx.onGesture("shake", (inner) => {
					seen.push("shake");
					inner.cancel();
				});
				ctx.onGesture("smile", () => {
					seen.push("smile");
					off();
				});
			},
			{ scope: false },
		);
		await tick();

		for (const gesture of ["nod", "shake", "shake", "smile", "nod"]) {
			dispatchGesture(harness, { gesture, confidence: 0.9 });
			await tick();
		}

		expect(seen).toEqual(["nod", "shake", "smile"]);
	});

	test("a trigger that fires again for the same element replaces the previous subscriptions", async () => {
		const wrapper = addElement(harness, "wrapper");
		let subscribed = 0;
		const seen: string[] = [];
		harness.reaction("a").onEvent(".wrapper", "click", (ctx) => {
			subscribed += 1;
			ctx.onGesture("nod", () => {
				seen.push("nod");
			});
		});
		await tick();

		click(wrapper);
		await tick();
		click(wrapper);
		await tick();
		dispatchGesture(harness, { gesture: "nod", confidence: 0.9 });
		await tick();

		expect(subscribed).toBe(2);
		expect(seen).toEqual(["nod"]);
	});

	test("stop() and ctx.cancel() of the parent end the subscriptions too", async () => {
		addElement(harness, "modal");
		addElement(harness, "other");
		const seen: string[] = [];
		const stopped = harness.reaction("a").onVisible(
			".modal",
			(ctx) => {
				ctx.onGesture("nod", () => {
					seen.push("stopped");
				});
			},
			{ scope: false },
		);
		harness.reaction("b").onVisible(
			".other",
			(ctx) => {
				ctx.onGesture("nod", () => {
					seen.push("cancelled");
				});
				ctx.cancel();
			},
			{ scope: false },
		);
		await tick();

		dispatchGesture(harness, { gesture: "nod", confidence: 0.9 });
		await tick();
		stopped.stop();
		dispatchGesture(harness, { gesture: "nod", confidence: 0.9 });
		await tick();

		expect(seen).toEqual(["stopped"]);
	});

	test("subscribing after the run has ended does nothing", async () => {
		const modal = addElement(harness, "modal");
		const seen: string[] = [];
		harness.reaction("a").onVisible(
			".modal",
			async (ctx) => {
				ctx.onGesture("shake", () => {});
				await new Promise((resolve) => setTimeout(resolve, 350));
				ctx.onGesture("nod", () => {
					seen.push("late");
				});
			},
			{ scope: false },
		);
		await tick();
		modal.setAttribute("hidden", "");
		await new Promise((resolve) => setTimeout(resolve, 500));

		dispatchGesture(harness, { gesture: "nod", confidence: 0.9 });
		await tick();

		expect(seen).toEqual([]);
	});
});

describe("ctx.show and ctx.hide", () => {
	const click = (element: Element) =>
		element.dispatchEvent(
			new harness.domWindow.Event("click", { bubbles: true }),
		);

	const beta = () =>
		harness.messages.filter(
			(message) =>
				message.type === "reaction/show" || message.type === "reaction/hide",
		);

	async function startShowingOnClick(
		options?: { signal?: AbortSignal },
		showOptions?: ShowOptions,
	) {
		const reaction = harness
			.reaction("calm", options)
			.onEvent(".buy", "click", (ctx) => {
				ctx.show("pulse", showOptions);
			})
			.onEvent(".done", "click", (ctx) => ctx.hide());
		await tick();
		return reaction;
	}

	test("show sends the vital with position and size", async () => {
		await startShowingOnClick(undefined, {
			position: "top-left",
			size: "small",
		});
		click(addElement(harness, "buy"));
		await tick();

		expect(beta()).toEqual([
			{
				type: "reaction/show",
				pluginName: "calm",
				vital: "pulse",
				position: "top-left",
				size: "small",
			},
		]);
	});

	test("show lasts after the handler ends, until ctx.hide", async () => {
		await startShowingOnClick();
		click(addElement(harness, "buy"));
		await tick();
		expect(beta().map((message) => message.type)).toEqual(["reaction/show"]);

		click(addElement(harness, "done"));
		await tick();

		expect(beta()).toEqual([
			expect.objectContaining({ type: "reaction/show" }),
			{ type: "reaction/hide", pluginName: "calm" },
		]);
	});

	test("hide without a show sends nothing, and a second hide sends nothing", async () => {
		await startShowingOnClick();
		const done = addElement(harness, "done");
		click(done);
		await tick();
		expect(beta()).toEqual([]);

		click(addElement(harness, "buy"));
		click(done);
		click(done);
		await tick();

		expect(beta().map((message) => message.type)).toEqual([
			"reaction/show",
			"reaction/hide",
		]);
	});

	test("showing again sends a new show, and one hide covers both", async () => {
		const reaction = await startShowingOnClick();
		const buy = addElement(harness, "buy");
		click(buy);
		click(buy);
		await tick();
		reaction.stop();

		expect(beta().map((message) => message.type)).toEqual([
			"reaction/show",
			"reaction/show",
			"reaction/hide",
		]);
	});

	test("stop() takes Beta away once", async () => {
		const reaction = await startShowingOnClick();
		click(addElement(harness, "buy"));
		await tick();

		reaction.stop();
		reaction.stop();
		await tick();

		expect(beta().map((message) => message.type)).toEqual([
			"reaction/show",
			"reaction/hide",
		]);
	});

	test("stop() sends no hide when nothing was shown", async () => {
		const reaction = await startShowingOnClick();
		reaction.stop();
		await tick();

		expect(beta()).toEqual([]);
	});

	test("abort() takes Beta away", async () => {
		const controller = new AbortController();
		await startShowingOnClick({ signal: controller.signal });
		click(addElement(harness, "buy"));
		await tick();

		controller.abort();
		await tick();

		expect(beta().map((message) => message.type)).toEqual([
			"reaction/show",
			"reaction/hide",
		]);
	});

	test("a show made inside a subscription is removed when the reaction stops", async () => {
		const reaction = harness
			.reaction("nested")
			.onEvent(".buy", "click", (ctx) => {
				ctx.onEvent(harness.domWindow, "keydown", (inner) =>
					inner.show("breathing"),
				);
			});
		await tick();
		click(addElement(harness, "buy"));
		await tick();
		harness.domWindow.dispatchEvent(new harness.domWindow.Event("keydown"));
		await tick();

		reaction.stop();

		expect(beta().map((message) => message.type)).toEqual([
			"reaction/show",
			"reaction/hide",
		]);
	});

	test("a transport that fails does not break the handler", async () => {
		harness.failTransport();
		let reached = false;
		harness.reaction("calm").onEvent(".buy", "click", (ctx) => {
			ctx.show("pulse");
			ctx.hide();
			reached = true;
		});
		await tick();
		click(addElement(harness, "buy"));
		await tick();

		expect(reached).toBe(true);
	});
});
