import { expect, test } from "bun:test";
import { GESTURE_EVENT_NAME, SIGNAL_EVENT_NAME } from "@repo/protocol";
import { Window } from "happy-dom";
import { createArticles } from "../../../apps/demo/src/blog/articles";
import { renderIndex } from "../../../apps/demo/src/blog/render";
import {
	renderBreatheScreen,
	renderSleepScreen,
} from "../../../apps/demo/src/screens/render";
import { parseHeader } from "../src/header";
import { createReactionFactory, type RuntimeEnvironment } from "../src/index";

const exampleRoot = new URL("../../../example/", import.meta.url);

async function readExample(path: string): Promise<string> {
	return Bun.file(new URL(path, exampleRoot)).text();
}

test("the shipped rating example fills the form and submits it once the blog opens the modal", async () => {
	const page = renderIndex(createArticles());
	const pluginSource = await readExample("scripts/rate-our-service.js");
	expect(parseHeader(pluginSource).ok).toBe(true);

	const window = new Window({
		url: "http://localhost:4010/",
		settings: { enableJavaScriptEvaluation: true },
	});
	window.document.write(page);
	await window.happyDOM.waitUntilComplete();

	const questions: unknown[] = [];
	const environment = {
		window,
		document: window.document,
		transport: async (message: unknown) => {
			questions.push(message);
			return "smile";
		},
		now: Date.now,
	} as unknown as RuntimeEnvironment;
	Object.assign(globalThis, {
		reaction: createReactionFactory(() => environment),
		HTMLInputElement: window.HTMLInputElement,
	});
	new Function(pluginSource)();
	await new Promise((resolve) => setTimeout(resolve, 20));
	const askedWhileHidden = questions.length;

	(
		window.document.querySelector("#open-rating") as unknown as HTMLElement
	).click();
	await new Promise((resolve) => setTimeout(resolve, 50));

	expect(askedWhileHidden).toBe(0);
	expect(questions).toHaveLength(1);
	expect(window.document.querySelector("#result")?.textContent).toBe(
		"Thanks! You rated us 5 of 5.",
	);
	await window.happyDOM.close();
});

/** What `sessionStorage` is to the pages of one tab: it is the same object for the page that a link opens. */
function createFakeStorage() {
	const items = new Map<string, string>();
	return {
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
	};
}

/** Runs the head navigation example on a page of three links, with the clock and the answers in the test's hands. */
async function runHeadNavigation(storage = createFakeStorage()) {
	const pluginSource = await readExample("scripts/scroll-page.js");
	expect(parseHeader(pluginSource).ok).toBe(true);

	const window = new Window({ url: "http://localhost:4010/" });
	window.document.write(
		'<a href="#one">One</a><a href="#two">Two</a><a href="#three">Three</a>',
	);
	const messages: unknown[] = [];
	let now = Date.now();
	const environment = {
		window,
		document: window.document,
		transport: async (message: unknown) => {
			messages.push(message);
			return "timeout";
		},
		now: () => now,
	} as unknown as RuntimeEnvironment;
	const realNow = Date.now;
	Date.now = () => now;
	const scrolls: ScrollToOptions[] = [];
	const opened: string[] = [];
	window.document.addEventListener("click", (event) => {
		const link = event.target as unknown as HTMLAnchorElement;
		opened.push(link.textContent ?? "");
		event.preventDefault();
	});
	window.HTMLElement.prototype.scrollIntoView = () => {};
	Object.assign(globalThis, {
		reaction: createReactionFactory(() => environment),
		document: window.document,
		sessionStorage: storage,
		HTMLAnchorElement: window.HTMLAnchorElement,
		scrollBy: (options: ScrollToOptions) => scrolls.push(options),
		innerHeight: 1000,
	});
	new Function(pluginSource)();
	await new Promise((resolve) => setTimeout(resolve, 5));

	const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
	return {
		storage,
		scrolls,
		opened,
		toasts: () =>
			messages.flatMap((message) => {
				const { type, text } = message as { type: string; text?: string };
				return type === "reaction/toast" ? [text] : [];
			}),
		/** Where the head is: the text of the link with the ring, or nothing. */
		onLink: () =>
			window.document.querySelector("[data-head-focus]")?.textContent ?? null,
		async gesture(name: string, afterMs = 1000) {
			now += afterMs;
			window.dispatchEvent(
				new window.CustomEvent(GESTURE_EVENT_NAME, {
					detail: { gesture: name, confidence: 0.9 },
				}),
			);
			await settle();
		},
		async face(angry: number, afterMs = 100) {
			now += afterMs;
			window.dispatchEvent(
				new window.CustomEvent(SIGNAL_EVENT_NAME, {
					detail: { signal: "expression", value: { ANGRY: angry }, at: now },
				}),
			);
			await settle();
		},
		close: () => {
			Date.now = realNow;
			return window.happyDOM.close();
		},
	};
}

test("the head navigation example moves between links like Tab and Shift+Tab, and a lean to the right opens the link", async () => {
	const page = await runHeadNavigation();
	expect(page.onLink()).toBe("One");

	await page.gesture("tilt-down");
	expect(page.onLink()).toBe("Two");
	await page.gesture("tilt-down");
	expect(page.onLink()).toBe("Three");
	await page.gesture("tilt-up");
	expect(page.onLink()).toBe("Two");
	await page.gesture("tilt-up");
	expect(page.onLink()).toBe("One");
	await page.gesture("tilt-up");
	expect(page.onLink()).toBe("Three");
	await page.gesture("roll-right");

	expect(page.opened).toEqual(["Three"]);
	expect(page.scrolls).toEqual([]);
	await page.close();
});

test("the head navigation example waits one cooldown between two tilts", async () => {
	const page = await runHeadNavigation();

	await page.gesture("tilt-down");
	await page.gesture("tilt-down", 200);

	expect(page.onLink()).toBe("Two");
	await page.close();
});

test("a lean to the left switches to the scroll mode and back, and in it tilts scroll and a lean to the right opens nothing", async () => {
	const page = await runHeadNavigation();
	await page.gesture("tilt-down");

	await page.gesture("roll-left");
	expect(page.toasts()).toEqual([
		"Scroll: tilt to scroll, lean left for links",
	]);
	await page.gesture("tilt-down");
	await page.gesture("tilt-up");
	await page.gesture("roll-right");

	expect(page.scrolls).toEqual([
		{ top: 800, behavior: "smooth" },
		{ top: -800, behavior: "smooth" },
	]);
	expect(page.onLink()).toBe("Two");
	expect(page.opened).toEqual([]);

	await page.gesture("roll-left");
	expect(page.toasts()).toEqual([
		"Scroll: tilt to scroll, lean left for links",
		"Links: tilt to move, lean right to open",
	]);
	await page.gesture("tilt-down");
	expect(page.onLink()).toBe("Three");
	await page.close();
});

test("the mode outlives a page: the page that a link opens keeps the scroll mode", async () => {
	const first = await runHeadNavigation();
	await first.gesture("roll-left");
	await first.close();

	const second = await runHeadNavigation(first.storage);
	await second.gesture("tilt-down");

	expect(second.scrolls).toEqual([{ top: 800, behavior: "smooth" }]);
	expect(second.onLink()).toBeNull();
	await second.close();
});

test("the head navigation example reads no expression, so the face cannot switch anything", async () => {
	const source = await readExample("scripts/scroll-page.js");
	const header = parseHeader(source);

	expect(header.ok && header.header.signals).toEqual([]);
	expect(source).not.toContain("onSignal");
});

test("the shipped blink example shows a toast on a double blink, then stays quiet for a while", async () => {
	const pluginSource = await readExample("scripts/blink-counter.js");
	const header = parseHeader(pluginSource);
	expect(header.ok && header.header.signals).toEqual(["blink"]);

	const window = new Window({ url: "http://localhost:4010/" });
	let now = 0;
	const toasts: unknown[] = [];
	const environment = {
		window,
		document: window.document,
		transport: async (message: { type: string; text?: string }) => {
			if (message.type === "reaction/toast") toasts.push(message.text);
			return "timeout";
		},
		now: () => now,
	} as unknown as RuntimeEnvironment;
	Object.assign(globalThis, {
		reaction: createReactionFactory(() => environment),
	});
	new Function(pluginSource)();
	await new Promise((resolve) => setTimeout(resolve, 5));

	const blink = (detected: boolean) =>
		window.dispatchEvent(
			new window.CustomEvent(SIGNAL_EVENT_NAME, {
				detail: { signal: "blink", value: { detected }, at: now },
			}),
		);
	const blinkOnce = () => {
		blink(true);
		blink(false);
	};
	blink(false);
	now = 100;
	blinkOnce();
	await new Promise((resolve) => setTimeout(resolve, 5));
	const toastsAfterOneBlink = toasts.length;

	now = 600;
	blinkOnce();
	await new Promise((resolve) => setTimeout(resolve, 5));
	now = 900;
	blinkOnce();
	await new Promise((resolve) => setTimeout(resolve, 5));
	const toastsDuringQuiet = toasts.length;

	now = 5000;
	blinkOnce();
	now = 5300;
	blinkOnce();
	await new Promise((resolve) => setTimeout(resolve, 5));

	expect(toastsAfterOneBlink).toBe(0);
	expect(toastsDuringQuiet).toBe(1);
	expect(toasts).toEqual(["Two blinks", "Two blinks"]);
	await window.happyDOM.close();
});

interface ShowMessage {
	type: string;
	vital?: string;
	position?: string;
	size?: string;
}

async function runPluginOnPage(
	pluginPath: string,
	url: string,
	page: string,
): Promise<ShowMessage[]> {
	const pluginSource = await readExample(pluginPath);
	const window = new Window({ url });
	window.document.write(page);
	await window.happyDOM.waitUntilComplete();

	const messages: ShowMessage[] = [];
	const environment = {
		window,
		document: window.document,
		location: window.location,
		transport: async (message: ShowMessage) => {
			messages.push(message);
			return "timeout";
		},
		now: Date.now,
	} as unknown as RuntimeEnvironment;
	Object.assign(globalThis, {
		reaction: createReactionFactory(() => environment),
		location: window.location,
	});
	new Function(pluginSource)();
	await new Promise((resolve) => setTimeout(resolve, 30));
	await window.happyDOM.close();
	return messages.filter((message) => message.type === "reaction/show");
}

test("the heart rate example declares the pulse and an always-on camera", async () => {
	const header = parseHeader(await readExample("scripts/heart-rate.js"));
	expect(header.ok).toBe(true);
	expect(header.ok && header.header.signals).toEqual(["pulse"]);
	expect(header.ok && header.header.camera).toBe("always");
});

test("the heart rate example shows the pulse on the sleep screen", async () => {
	const shown = await runPluginOnPage(
		"scripts/heart-rate.js",
		"http://localhost:4010/sleep",
		renderSleepScreen(),
	);
	expect(shown).toHaveLength(1);
	expect(shown[0]).toMatchObject({
		vital: "pulse",
		position: "bottom-right",
		size: "large",
	});
});

test("the heart rate example shows the pulse on the demo video and ignores other videos", async () => {
	const videoPage = "<video></video>";
	const demoVideo = await runPluginOnPage(
		"scripts/heart-rate.js",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		videoPage,
	);
	const otherVideo = await runPluginOnPage(
		"scripts/heart-rate.js",
		"https://www.youtube.com/watch?v=Z4cuLoGxHqQ",
		videoPage,
	);
	expect(demoVideo).toHaveLength(1);
	expect(demoVideo[0]).toMatchObject({ vital: "pulse", size: "large" });
	expect(otherVideo).toEqual([]);
});

test("the breathing example declares breathing and shows the pinwheel on the breathe screen", async () => {
	const header = parseHeader(
		await readExample("scripts/breathing-pinwheel.js"),
	);
	expect(header.ok).toBe(true);
	expect(header.ok && header.header.signals).toEqual(["breathing"]);
	expect(header.ok && header.header.camera).toBe("always");

	const shown = await runPluginOnPage(
		"scripts/breathing-pinwheel.js",
		"http://localhost:4010/breathe",
		renderBreatheScreen(),
	);
	expect(shown).toHaveLength(1);
	expect(shown[0]).toMatchObject({
		vital: "breathing",
		position: "bottom-right",
		size: "large",
	});
});

test("the demo index links to both screens", () => {
	const index = renderIndex(createArticles());
	expect(index).toContain('href="/sleep"');
	expect(index).toContain('href="/breathe"');
});
