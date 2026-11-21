/// <reference path="reactions.d.ts" />
// @ts-check
// ==Reaction==
// @name        Navigate the page with your head
// @author      Claude
// @match       *://localhost/*
// @camera      always
// @gestures    tilt-down, tilt-up, roll-left, roll-right
// ==/Reaction==

/** How far one tilt scrolls in the scroll mode, as a share of the window height, so the last line stays on screen. */
const SCROLL_SHARE = 0.8;

/** The link that the head is on carries this attribute, which the style below draws as a red frame 2px wide. */
const FOCUS_ATTRIBUTE = "data-head-focus";

/** Where the mode is kept between the pages of one tab: a page that opens replaces this one, but the head stays. */
const MODE_KEY = "pleiades:head-navigation-mode";

/** @type {"links" | "scroll"} */
let mode = loadMode();

/** @returns {"links" | "scroll"} */
function loadMode() {
	try {
		return sessionStorage.getItem(MODE_KEY) === "scroll" ? "scroll" : "links";
	} catch {
		return "links";
	}
}

/** @param {"links" | "scroll"} next */
function saveMode(next) {
	mode = next;
	try {
		sessionStorage.setItem(MODE_KEY, next);
	} catch {
		// A page without storage forgets the mode when it changes, nothing more.
	}
}

function addFocusStyle() {
	const style = document.createElement("style");
	// An outline looks like a border but takes no room, so the text around the link does not jump when the head moves.
	style.textContent = `[${FOCUS_ATTRIBUTE}] { outline: 2px solid red !important; outline-offset: 2px; }`;
	document.head.append(style);
}

/**
 * @param {HTMLAnchorElement} link
 * @returns {boolean}
 */
function isOnPage(link) {
	if (typeof link.checkVisibility === "function")
		return link.checkVisibility({ checkVisibilityCSS: true });
	return !link.hidden && link.closest("[hidden]") === null;
}

/** @returns {HTMLAnchorElement[]} */
function visibleLinks() {
	return Array.from(document.querySelectorAll("a")).filter(
		(link) => link.hasAttribute("href") && isOnPage(link),
	);
}

/** The link the head is on; if it is on none yet, the one the browser has focused, like Tab continues from there. */
function currentLink() {
	const marked = document.querySelector(`[${FOCUS_ATTRIBUTE}]`);
	return marked instanceof HTMLAnchorElement ? marked : document.activeElement;
}

/** @param {HTMLAnchorElement} link */
function putHeadOn(link) {
	for (const old of document.querySelectorAll(`[${FOCUS_ATTRIBUTE}]`))
		old.removeAttribute(FOCUS_ATTRIBUTE);
	link.setAttribute(FOCUS_ATTRIBUTE, "");
	link.focus({ preventScroll: true });
	link.scrollIntoView({ block: "center", behavior: "smooth" });
}

/**
 * Moves from link to link like Tab and Shift+Tab do, and starts over at the other end of the page.
 * @param {1 | -1} step 1 is Tab, -1 is Shift+Tab
 */
function moveBetweenLinks(step) {
	const links = visibleLinks();
	if (links.length === 0) return;
	const current = links.indexOf(currentLink());
	const first = step > 0 ? 0 : links.length - 1;
	const next =
		current === -1 ? first : (current + step + links.length) % links.length;
	const link = links[next];
	if (link) putHeadOn(link);
}

function openLinkUnderHead() {
	if (mode !== "links") return;
	const link = document.querySelector(`[${FOCUS_ATTRIBUTE}]`);
	if (link instanceof HTMLAnchorElement) link.click();
}

/**
 * Scrolls the page smoothly by one step.
 * @param {1 | -1} direction 1 scrolls down, -1 scrolls up
 */
function scrollPage(direction) {
	scrollBy({ top: direction * innerHeight * SCROLL_SHARE, behavior: "smooth" });
}

/**
 * A tilt does what the mode says: moves between links, or scrolls.
 * @param {1 | -1} direction
 */
function tilt(direction) {
	return () => {
		if (mode === "scroll") scrollPage(direction);
		else moveBetweenLinks(direction);
	};
}

/**
 * A lean to the left shoulder switches the mode. It fires once per lean, so no pause is needed here.
 * @param {Reactions.GestureContext} ctx
 */
function switchMode(ctx) {
	saveMode(mode === "links" ? "scroll" : "links");
	ctx.toast(
		mode === "links"
			? "Links: tilt to move, lean right to open"
			: "Scroll: tilt to scroll, lean left for links",
	);
}

addFocusStyle();

/**
 * The camera is on all the time (`@camera always`), so the cooldown keeps one long tilt from moving twice, and a
 * minimum confidence ignores a head that only drifts. No expression is used: a head tilted down looks gloomy to the
 * expression model, so the face cannot be trusted to switch anything.
 */
reaction("head-navigation")
	.cooldown(700)
	.minConfidence(0.6)
	.onGesture("tilt-down", tilt(1))
	.onGesture("tilt-up", tilt(-1))
	.onGesture("roll-right", openLinkUnderHead)
	.onGesture("roll-left", switchMode);
