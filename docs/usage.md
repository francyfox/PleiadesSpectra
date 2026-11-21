# Writing scripts

A script is **one plain JavaScript file**. It tells the Pleiades Spectra extension: "when this happens on this
website, ask the user (with a gesture) and do something". There are no imports and no build step.

The extension turns your camera into a few **gestures** (`smile`, `nod`, `tilt-down`, ...). Your script decides what
those gestures do on a page.

Contents: [The smallest script](#the-smallest-script) · [File format](#file-format) · [The header](#the-header) ·
[The chain](#the-chain) · [The context](#the-context) · [Gestures](#gestures) · [Signals](#signals) · [Camera modes](#camera-modes) ·
[Install and test](#install-and-test) · [Write it with an AI agent](#write-it-with-an-ai-agent) · [Rules](#rules)

## The smallest script

```js
// ==Reaction==
// @name      Smile to like
// @match     *://example.com/*
// @gestures  smile
// ==/Reaction==

reaction("like").onVisible(".like-popup", async (ctx) => {
	const answer = await ctx.ask("Like this page?", { expect: ["smile"] });

	if (answer === "smile") document.querySelector("#like")?.click();
});
```

- The block at the top is the **header**. The extension reads it without running your code.
- `reaction("like")` starts a **chain**. Below it you list triggers.
- `onVisible(".like-popup", ...)`: when an element that matches the selector becomes **visible** on the page, run the
  handler. It works for a popup that is added to the page and for one that already sits in the page hidden and is
  shown later (a class or `hidden` is toggled).
- `ctx.ask(...)` shows a question next to the page, turns the camera on for a few seconds and resolves with the
  gesture the user made (or the option they clicked with the mouse, or `"timeout"`).
- The last line is your action. Here it presses the "like" button.

A working copy is in [`example/scripts/rate-our-service.js`](../example/scripts/rate-our-service.js), and more
are in `packages/reactions/examples/`.

## File format

```js
// @ts-check                      (optional: editor type checks, see below)
// ==Reaction==
// @name      ...                 header, required fields first
// ==/Reaction==

reaction("id")                    the behaviour: one chain
  .onVisible(...)
  .onGesture(...);
```

- Use only plain JavaScript. The global `reaction()` is provided for you.
- The file must end in `.js`.
- Keep handlers small. Use optional chaining on DOM lookups (`document.querySelector("#x")?.click()`) so a missing
  element never throws.

## The header

The header is a block of `//` comment lines between `// ==Reaction==` and `// ==/Reaction==`. The extension shows it
in the install window, so users see what the script may do **before** it runs.

| Field       | Required                  | Meaning                                                                                                                                                          |
| ----------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@name`     | yes                       | Shown in the script list and the install window.                                                                                                                 |
| `@author`   | no                        | Shown in the install window.                                                                                                                                     |
| `@match`    | yes, one line per pattern | The sites the script runs on, as a [match pattern](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), e.g. `*://shop.example.com/*`. |
| `@camera`   | no                        | `on-demand` (default) or `always`. See [Camera modes](#camera-modes).                                                                                            |
| `@gestures` | no                        | Comma-separated gestures the script uses. The install window lists them.                                                                                         |
| `@signals`  | no                        | Comma-separated signals the script reads (`blink`, `pose`, `expression`, `pulse`, `breathing`). The install window lists them; without it no signals arrive.      |

`@gestures` and `@signals` are permissions, like `@grant` in Tampermonkey: a gesture or signal you did not declare never
reaches the script. The runtime drops it, `ctx.signals` returns nothing for it, and the console prints a warning once
per page. This is a guard against mistakes and against reading a neighbour script's data, not a security boundary:
a script is ordinary page JavaScript and could listen to `window` itself, so install only scripts you trust. Declare
exactly what you use.

An unknown field, an unknown gesture or a missing `@name` / `@match` is rejected with a readable message when you try
to install the file.

## The chain

`reaction(id)` returns a reaction. Every method returns the same reaction, so you chain them. The triggers run once the
chain is complete.

### Triggers

| Call                             | Runs when                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `onVisible(selector, handler, options?)` | A matching element becomes visible **to the user**: rendered (no `display: none`, `hidden`, closed `<dialog>` or `visibility: hidden` on it or an ancestor) and inside the viewport, as an `IntersectionObserver` reports it. Fires for elements that are visible already, and again each time an element hides and shows. Pass `{ scope: false }` to skip the viewport check and only watch rendering. |
| `onEvent(target, type, handler)` | A DOM event happens. `target` is a selector (delegated on the document) or an event target such as `window`.                                     |
| `onGesture(gesture, handler)`    | The camera recognises the gesture. Needs `@camera always`.                                                                                       |

### Modifiers

Modifiers apply to the **triggers declared after them**.

| Call                  | Meaning                                        |
| --------------------- | ---------------------------------------------- |
| `cooldown(ms)`        | Minimum time between two runs of each trigger. |
| `minConfidence(0..1)` | Ignores gestures below this confidence.        |

### Composition

| Call                  | Meaning                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `use(reaction \| fn)` | Adds the triggers of another reaction, or applies a function `(reaction) => reaction` to this one. |
| `stop()` | Removes every listener and observer of the reaction, also when called before it has started. |

```js
const calm = (r) => r.cooldown(1000).minConfidence(0.7);

reaction("scroll")
	.use(calm)
	.onGesture("tilt-down", () => scrollBy({ top: 400, behavior: "smooth" }))
	.onGesture("tilt-up", () => scrollBy({ top: -400, behavior: "smooth" }));
```

### Removing triggers

Three ways, from the narrowest to the widest:

| How | Removes |
| --- | --- |
| `ctx.cancel()` inside a handler | The trigger that fired. Use it to stop watching after the first answer. |
| `reaction.stop()` | Every trigger of the reaction, also when called before it has started. |
| `reaction(id, { signal })` and `controller.abort()` | Every trigger of the reaction, from your own `AbortController`. |

The signal is the web-standard way to cancel, so the same controller can also remove your own listeners and cancel
`fetch` calls with one `abort()`:

```js
const controller = new AbortController();

reaction("rate", { signal: controller.signal }).onVisible("#modal", async (ctx) => {
  const answer = await ctx.ask("How was it?", { expect: ["smile"] });
  if (answer === "smile") controller.abort();
});

window.addEventListener("keydown", () => {}, { signal: controller.signal });
```

A signal that is already aborted keeps the reaction from starting at all. The runtime never creates a controller
itself: you own it.

> **Note: `.use(otherReaction)` and signals.** When a reaction adopts another one with `.use(other)`, the triggers
> move to the adopting reaction and run under **its** signal. The signal passed to `other` itself is ignored, and
> `other.stop()` no longer removes those triggers, because `other` never starts on its own. To cancel them, abort the
> signal of the reaction that called `.use()` (or call its `stop()`). A helper function `.use((r) => r.cooldown(500))`
> has no such caveat: it works on the reaction that called it.

## The context

Every handler gets a context `ctx`:

| Member                       | Meaning                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ctx.ask(question, options)` | Turns the camera on, shows the question and resolves with a gesture, the clicked option or `"timeout"`. |
| `ctx.toast(text)`            | Shows a short message next to the page.                                                                 |
| `ctx.show(vital, options?)` | Beta stands on the page without a question and shows `"pulse"` or `"breathing"`; see [Showing a measurement](#showing-a-measurement). |
| `ctx.hide()` | Takes away the Beta that this script showed with `ctx.show`. |
| `ctx.cancel()` | Removes the trigger that fired this handler (for example, stop watching after the first answer). The other triggers of the reaction keep working. |
| `ctx.onGesture(gesture, handler)` | Listens for a gesture **while this run of the handler is alive**; see [Subscriptions inside a handler](#subscriptions-inside-a-handler). Returns a function that unsubscribes. |
| `ctx.onEvent(target, type, handler)` | Listens for a DOM event with the same lifetime as `ctx.onGesture`. Returns a function that unsubscribes. |
| `ctx.onSignal(name, handler, options?)` | Listens for samples of a signal with the same lifetime as `ctx.onGesture`. Returns a function that unsubscribes. |
| `ctx.signals`                | Recent signal measurements: `latest`, `history`, `blinks`, `poseChange`, `average`; see [Signals](#signals). Available in every handler. |
| `ctx.sample`                 | `{ signal, value, at }` (`onSignal`); `value` is typed by the signal name.                              |
| `ctx.element`                | The matched element (`onVisible`, and `onEvent` with a selector).                                        |
| `ctx.domEvent`               | The DOM event (`onEvent`).                                                                              |
| `ctx.event`                  | `{ gesture, confidence }` (`onGesture`).                                                                |

### Subscriptions inside a handler

`onGesture` and `onEvent` at the top of the chain listen for as long as the reaction lives. When a gesture or an event
only makes sense while something is on the page, subscribe from the handler: the subscription is removed for you.

```js
reaction("promo").onVisible("video.promo", (ctx) => {
  ctx.onGesture("nod", () => document.querySelector("video.promo")?.play());
  ctx.onGesture("shake", () => document.querySelector("video.promo")?.pause());
  ctx.onEvent(window, "keydown", ({ domEvent }) => {
    if (domEvent.key === "Escape") ctx.toast("Closing the video");
  });
});
```

A subscription ends when the first of these happens:

- the element that fired the trigger is hidden or removed (a trigger without an element, such as `onGesture`, has
  no such end);
- the address of the page changes, as in a single-page app;
- `ctx.cancel()` or `reaction.stop()` is called, or the signal of the reaction is aborted;
- the same trigger fires again for the same element (the new run starts with a clean slate);
- you call the function that `ctx.onGesture` or `ctx.onEvent` returned. `ctx.cancel()` inside the nested handler does
  the same for that one subscription.

`cooldown` and `minConfidence` of the reaction apply to the subscriptions too, and gestures still need
`@camera always`. Subscribe before the first `await`: once the run has ended, the call does nothing.

`ctx.ask` options:

```js
const answer = await ctx.ask("How was our service?", {
	expect: ["smile", "confused"], // gestures the user may answer with
	labels: { smile: "Good", confused: "So-so" }, // button text, optional
	timeoutMs: 8000, // optional, default 8000
	position: "top-left", // optional, default "bottom-right"
	size: "large", // optional, default "medium"
});
```

- Every expected gesture also becomes a **mouse button**, so users can always click instead of making a gesture.
- The timeout is counted from the moment the camera is ready, not from when the question appears. The camera needs a
  few seconds to warm up.
- The result is one of the gestures in `expect`, or `"timeout"`.
- `position` is a named place: `"top-left"`, `"top"`, `"top-right"`, `"left"`, `"center"`, `"right"`, `"bottom-left"`,
  `"bottom"` or `"bottom-right"`. For an exact spot give distances in pixels from the edges of the window, for example
  `{ top: 120, left: 24 }`; a side that is left out is not tied to its edge. On the left side of the screen Beta is turned
  around to look at the page, and the question card moves to the other side so it never covers her.
- `size` is `"small"` (120 px), `"medium"` (180 px) or `"large"` (260 px), or the width of Beta in pixels (60–600).
- A wrong `position` or `size` is ignored and the default is used. Both apply to this question only; the next one starts
  from the defaults again.
- A question belongs to its place. If the page moves on while it is open (a single-page app changes the route, the
  element that triggered it is removed or hidden, the tab closes or navigates), the question is dropped, the camera
  is turned off and `ask` resolves with `"timeout"`.

## Gestures

| Gesture                | Comes from                                                       |
| ---------------------- | ---------------------------------------------------------------- |
| `nod`, `shake`         | Head movement from the face landmarks, against the resting pose. |
| `tilt-down`, `tilt-up` | Head tilt from the face landmarks.                               |
| `smile`, `confused`    | Smoothed SmartSpectra expression scores.                         |
| `talking`              | SmartSpectra speech detection from the video.                    |

There is no gaze and no health reading, and scripts cannot get any. A script only ever receives a gesture name and a
confidence, never the picture or the face points.

Expression-based gestures (`smile`, `confused`) are noisy. Offer a mouse choice for anything important (`ask` does
this for you) and avoid actions that cannot be undone.

## Signals

Gestures are ready-made decisions. **Signals** are the measurements behind them, so a script can set its own
conditions: how many blinks, which way the head moved, how fast the pulse is. Declare what you read in the header
(`// @signals blink, pose`) and use `@camera always`; the install window lists the signals.

| Signal       | Value                                          | Arrives                                  |
| ------------ | ---------------------------------------------- | ---------------------------------------- |
| `blink`      | `{ detected }`                                 | when the value changes (a rising edge is one blink) |
| `pose`       | `{ yaw, pitch }` from the rest pose, in eye distances | up to 15 times a second           |
| `expression` | scores 0-100 per expression (`HAPPY`, `SAD`, ...) | with every new expression             |
| `pulse`      | `{ bpm, confidence, stable }`                  | with every new SDK value                 |
| `breathing`  | `{ rate, confidence, stable }`                 | with every new SDK value                 |

`pulse` and `breathing` are not medical readings: never diagnose or give health advice from them. `blink` has not been
verified against real blinks yet.

```js
// @signals  blink, pose
reaction("blinks")
	.onSignal("blink", (ctx) => {
		if (ctx.signals.blinks(2000) >= 2) ctx.toast("Two blinks");
	})
	.onSignal("pose", ({ sample }) => {
		if (sample.value.yaw > 0.3) console.log("looking right");
	}, { minIntervalMs: 200 });
```

`onSignal(name, handler, { minIntervalMs })` runs the handler for every sample (at most once per `minIntervalMs`).
`cooldown` applies to it as to other triggers, `minConfidence` does not (confidence is part of the value). Mind that
`cooldown` also skips the samples in between: for a pattern over several samples (a double blink) count with
`ctx.signals` and keep your own quiet period, as [`blink-counter.js`](../example/scripts/blink-counter.js) does.

`ctx.signals` works in every handler, not only in `onSignal`:

| Call                             | Returns                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `latest(name)`                   | the newest sample or `undefined`                                                          |
| `history(name, { withinMs })`    | samples of the last `withinMs` (default: all), oldest first                               |
| `blinks(withinMs)`               | rising edges (`false` to `true`) of `blink` in the window                                 |
| `poseChange(withinMs)`           | `{ yaw, pitch }`: last `pose` sample minus the first (zeros with fewer than two samples)  |
| `average(name, field, withinMs)` | mean of a numeric field (`"bpm"`, `"rate"`, `"yaw"`, ...) or `undefined`                  |

The helpers do not limit you: everything can be computed from `history`. The history keeps at most 60 seconds and
2000 samples per signal and lives only in the page; nothing is stored. Scripts run in the page and can send what they
read elsewhere, so install only scripts you trust.

### Showing a measurement

`ctx.show("pulse" | "breathing", { position?, size? })` makes Beta stand on the page without a question and show the
measurement while its samples keep coming: a beating heart and the number of bpm for `pulse`, a pinwheel and the number
of br/m for `breathing`. `position` and `size` are the same as in `ctx.ask`; when omitted, the widget picks its own.

- The script must declare the signal in `@signals` (otherwise the measurements never reach it) and use
  `@camera always`, which the user agrees to by installing the script.
- The show is not tied to the handler or the element: it lasts until `ctx.hide()`, and goes away on its own when the
  reaction stops (`reaction.stop()` or an aborted `signal`). Calling `ctx.show` again moves or resizes Beta.
- `ctx.hide()` removes only what this script showed; with nothing shown it does nothing.
- Pulse and breathing are not medical readings: the widget is a picture of a measurement, not a health indicator.

```js
// @ts-check
// ==Reaction==
// @name     Pulse while reading
// @match    *://example.com/articles/*
// @camera   always
// @signals  pulse
// ==/Reaction==
reaction("pulse-reader")
	.onVisible("article", (ctx) => {
		ctx.show("pulse", { position: "top-right", size: "small" });
	})
	.onVisible("footer.comments", (ctx) => {
		ctx.hide();
		ctx.toast("Thanks for reading");
	});
```

## Camera modes

| Mode                          | Use it when                                                        | How it behaves                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@camera on-demand` (default) | The page itself shows the moment: a rating dialog, a confirmation. | The camera is on only while `ctx.ask(...)` waits for an answer.                                                                     |
| `@camera always`              | You need constant gestures or signals: scrolling, media control, blinks.              | Needed for `onGesture` and `onSignal`. The camera runs while a tab that matches `@match` is open **and in front** (a matching tab in the background, or another site in front, does not hold it). Installing the script is the user's consent, and the install window says so. Beta stands in the corner with a red dot while the camera runs; a click on the dot, or **Turn off camera** in the popup, pauses the camera on that tab until it is reloaded. |

Prefer `on-demand`. If you use `always`, keep a high `cooldown` so one gesture does not repeat an action.

```js
// ==Reaction==
// @name      Scroll by tilt
// @match     *://*/*
// @camera    always
// @gestures  tilt-down, tilt-up
// ==/Reaction==

reaction("scroll")
	.cooldown(400)
	.minConfidence(0.6)
	.onGesture("tilt-down", () => scrollBy({ top: 400, behavior: "smooth" }))
	.onGesture("tilt-up", () => scrollBy({ top: -400, behavior: "smooth" }));
```

## Editor types

JavaScript itself does not read `.d.ts` files: the browser and the extension ignore them. Your **editor** does. VS Code,
WebStorm and every editor that runs the TypeScript language service use a `.d.ts` to complete and check plain `.js`
files too. With the file in place you see types and docs for `reaction`, `onVisible`, `ctx.ask` and the rest, and a typo
such as `expect: ["wink"]` or `ctx.nothing()` is underlined.

1. Save [`reactions.d.ts`](../packages/reactions/reactions.d.ts) next to your script. The extension help
   (**How to use → For developers**) has **Copy typings** and **Download reactions.d.ts** buttons.
2. Start the script with two lines:

   ```js
   /// <reference path="reactions.d.ts" />
   // @ts-check
   // ==Reaction==
   // @name      ...
   ```

   The first line loads the types, the second turns on type checking for the file. The extension reads only the
   `==Reaction==` block, so these lines are safe above it.

Prefer a project setup? Put `reactions.d.ts` in a folder with a `jsconfig.json` instead and drop the reference line:

```json
{
	"compilerOptions": {
		"checkJs": true,
		"target": "ES2022",
		"lib": ["ES2022", "DOM"]
	},
	"include": ["*.js", "reactions.d.ts"]
}
```

Checked with `tsc --allowJs --checkJs` (the engine behind VS Code): a script with the reference line reports
`Type '"wink"' is not assignable to type 'Gesture'` and `Property 'nothing' does not exist on type 'VisibleContext'`.

## Install and test

1. Start the local server and the extension (see the repository README).
2. Open the extension's **Scripts** page and drop your `.js` file on it (or use **Choose files**).
3. The install window shows the author, the sites, the camera mode, the gestures and the full code. Press
   **Install**. A file with an invalid header is refused with a message.
4. Open a page that matches `@match`. If the camera has not been allowed yet, the extension asks once.
5. Use **Spectra check** in the popup to see what Spectra recognises, and turn on **Show logs** to see the raw
   responses in the browser console.

To try a script on a ready page, run `bun run dev` (it starts the demo app `apps/demo` with the others; a demo blog with 15 articles and a "Rate us" button on
<http://localhost:4010>, port from `DEMO_PORT`) and install `example/scripts/rate-our-service.js`. `bun run e2e` runs the same scenario in a
real Chrome (`google-chrome-stable`, or set `CHROME_PATH`).

`example/scripts/scroll-page.js` moves around the page with your head. By default a tilt down or up goes to the next or
the previous link, like Tab and Shift+Tab, and a lean of the head to the right shoulder (`roll-right`) opens the link
you are on. A lean to the left shoulder (`roll-left`) switches to the scroll mode, where the same tilts scroll the page
(the right lean opens nothing); another left lean switches back, and a toast says which mode you are in. Each lean
fires once: bring the head upright before the next one. It uses `@camera always` (the camera runs while the page is
open and in front) and reads no expression, because a head tilted down looks gloomy to the expression model. The mode
is kept in `sessionStorage`, so it survives the page that a link opens. The demo blog has links and is long enough to
try both modes.

`example/scripts/heart-rate.js` shows the pulse on a black screen. Start the demo app (`bun run dev`, or `bun run --cwd apps/demo dev` alone), open
<http://localhost:4010/sleep>, install the script: Beta stands in the
bottom-right corner with the beating heart and the bpm number. On YouTube the script works only for the video
<https://youtu.be/dQw4w9WgXcQ> and leaves other videos alone.

`example/scripts/breathing-pinwheel.js` does the same for breathing: open <http://localhost:4010/breathe>, install
the script, and the pinwheel with the breaths per minute appears. Pulse and breathing here are
not medical readings; the scripts do not store or send them.

Editing a script means installing the new file. The old version stays in the list until you remove it, so **delete the
old one first** (the trash icon). **Show code** (the `</>` icon) opens the installed source.

User scripts must be allowed once: in Chrome, `chrome://extensions` → the extension → Details → **Allow User
Scripts**. The Scripts page shows a banner with the steps while this is off.

### Scripts that share pages

Scripts on the same page share the extension's resources: questions in a queue, one Beta widget per tab, one
camera, and every script receives every gesture (two scripts that listen for `nod` both react). The Scripts page
helps you see it: an enabled script that runs on the same pages as another enabled one gets a blue bar and the line
**Shares pages with: ...**. When they also listen for the same gestures, read the same signals or both ask for
`@camera always`, a short warning says so. Turning a script off updates the highlight at once. The install window
shows the same for the new script against the installed ones. The check compares the `@match` patterns; when it
cannot tell, it errs on the side of showing the overlap.

### Several scripts on one page

- **Questions** (`ctx.ask`) stand in one queue for the whole extension. While one question is open the next waits, and
  your `await ctx.ask(...)` waits with it; the `timeoutMs` of a question counts from the moment it is shown, not from
  the moment it was queued. At most 5 questions wait; a sixth gets `"timeout"` at once. A question whose page was
  closed or reloaded leaves the queue and gets `"timeout"`.
- **Showing a measurement** (`ctx.show`) and **toasts**: the newest wins.
- **Gestures** go to every script, so two scripts that listen for `nod` both react.

## Write it with an AI agent

Connect an agent once (**Scripts → Connect to AI**, the command is shown for Claude Code, Codex and a custom JSON
config). The agent gets these MCP tools:

| Tool               | Does                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `get_script_guide` | Returns the rules, `reactions.d.ts` and examples.                                          |
| `validate_script`  | Checks a file's header without running it.                                                 |
| `list_scripts`     | Lists the installed scripts.                                                               |
| `get_script`       | Returns the source of one installed script.                                                |
| `propose_script`   | Opens the install window. The agent never installs anything itself: you press **Install**. |

Tell the agent what you want ("On shop.com, when the rating window appears, let me answer with a smile"), and it writes
the file, validates it and proposes it. Keep the Scripts page open while it works: the connection lives on that page.

## Rules

- Plain JavaScript only: no imports, no `eval`, no external requests.
- The script runs in an isolated world: it sees the page's DOM but not the page's own JavaScript variables.
- A script can click, read and change the pages of the sites in `@match`. Match only the sites you need and install
  only scripts you understand.
- Never infer health or emotion beyond the gestures and signals listed above. Pulse and breathing are not medical
  readings: no diagnoses, no health advice. The extension is not a medical tool.
- Offer a mouse alternative for every gesture, and keep handlers small and defensive.
