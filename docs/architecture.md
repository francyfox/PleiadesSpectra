# Architecture: "Tampermonkey for the face" — scripts that react to gestures

Idea 22 from `docs/idea.md`. Revision of 2026-11-19. No PleiadesOrchestra and no agent of our own.

The SmartSpectra SDK is turned into a set of gestures and face reactions. The behaviour is set by **scripts**: one file
per script, with a chain API in the style of Elysia. A script is written by a person or by any agent (Claude, ChatGPT)
from the types file; the extension has a list of scripts and installs them by loading a file. By default the camera
turns on **only on an event** (a rating modal appeared) and turns off after the answer; the camera for always scripts
(gestures such as scrolling) runs while the page that the script is installed for is open and active.

## Data flow

```
Page ── event (.rating-modal appeared) ──▶ script (userScripts, USER_SCRIPT world)
                                                │ ctx.ask(...)
                                                ▼
                       content script ⇄ background ⇄ camera (Chrome: offscreen; Firefox: an extension tab)
                                                │ frames over WS (localhost)      ▲ gesture events
                                                ▼                                 │
                                apps/server: SmartSpectra SDK + gesture recognition
```

## Parts

| Part           | Where                              | What it does                                                                       |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| Script runtime | `packages/reactions` (new)         | the chain API, the `.d.ts` types, the header parser; built into one JS for userScripts |
| Extension      | `apps/wxt` (WXT, Alpine CSP + TSX) | the list and installation of scripts, consent, the camera, the overlay (`ask`, `toast`) |
| Server         | `apps/server` (Bun, Elysia)        | the SDK session (`#lib/spectra-sdk`), gestures, a WS for frames and events         |

## A script: one file

```js
// ==Reaction==
// @name        Service rating
// @match       *://shop.example.com/*
// @camera      on-demand
// @gestures    smile, confused, nod
// ==/Reaction==

reaction("rating").onVisible(".rating-modal", async (ctx) => {
	const answer = await ctx.ask("How was our service?", {
		expect: ["smile", "confused"],
		timeoutMs: 8000,
	});
	if (answer === "smile") document.querySelector("#rate-5")?.click();
	if (answer === "confused") document.querySelector("#rate-2")?.click();
});
```

```js
// ==Reaction==
// @name        Scroll by tilt
// @match       *://*/*
// @camera      always
// @gestures    tilt-down, tilt-up
// ==/Reaction==

reaction("scroll")
	.cooldown(400)
	.onGesture("tilt-down", () => scrollBy({ top: 400, behavior: "smooth" }))
	.onGesture("tilt-up", () => scrollBy({ top: -400, behavior: "smooth" }));
```

- **The header** is what the extension reads **without running any code**: the name, the sites (`@match` → `matches`
  in `userScripts.register`), the camera mode, and which signals are needed (consent is built on them).
- **The chain** is the behaviour. As in Elysia, each method returns the instance and accumulates types.
  - Triggers: `.onVisible(selector, h)`, `.onEvent(target, type, h)`, `.onGesture(gesture, h)` (only with
    `@camera always`).
  - Modifiers: `.cooldown(ms)`, `.minConfidence(n)`.
  - Composition: `.use(otherReaction)` — like `.use()` in Elysia, for shared pieces inside one file.
- **`ctx`**: `ask(question, { expect, timeoutMs, position, size })` → a gesture or `"timeout"` (turns the camera on
  for the time of the question and shows the overlay); `toast(text)`; `event` (`{ gesture, confidence, expression }`)
  for `onGesture`.
- Gestures: `nod`, `shake`, `tilt-down`, `tilt-up` (from the face points, computed by us), `smile`, `confused` (from
  `expression`), `talking` (from `talking`). There is no gaze; a wink comes later and only from the eyelid points.
- The file is **plain JS** with no imports: `reaction` is a global function from the runtime. For an agent and an
  editor there are `reactions.d.ts` and `// @ts-check`. TypeScript files come later (transpiling in the extension, for
  example with sucrase).

## The extension

1. **The list of scripts** (an extension page): the name, sites, camera mode, signals, on/off, delete, view the code.
2. **Install by loading a file** (`<input type=file multiple>` and drag and drop): the extension parses the header and
   shows the code, the sites, and that the script may turn the camera on → "Install". Without a valid header: a
   refusal. Storage: `storage.local` (the code + the parsed header).
3. **Registration**: `userScripts.register({ id, matches, js: [{ code: runtime }, { code: script }], world: "USER_SCRIPT" })`.
   The runtime and the script share one world; scripts from different files are isolated by `worldId`.
   - Chrome: the user turns on "Allow User Scripts" once at `chrome://extensions` (Chrome 138+).
   - Firefox: `userScripts` is an optional permission, with an "Allow scripts" button → `permissions.request()`;
     after an extension update the scripts are wiped, so re-register them in `runtime.onInstalled`.
4. **How a script talks to the extension**: `userScripts.configureWorld({ messaging: true })`; the script sends
   `runtime.sendMessage` (`ask`, `toast`), and the gesture events come through the content script (a `CustomEvent` on
   `window`).
5. **The overlay** (content script, shadow root, Alpine): the `ask` question, the indicator "camera is on — script
   "Service rating"", the fallback buttons (answer with the mouse), "Turn off".

## The camera

- **On an event (the default).** `ctx.ask()` → the background turns the camera on → frames go to the server → it waits
  for a gesture from `expect` or a timeout → the camera turns off. Every turn-on is visible in the overlay.
- **The camera of an always script** is held while the active tab of the last focused window matches the `@match` of an
  enabled script with `@camera always` and is not paused. A background tab, or another site in focus, does not hold the
  camera. The sign for the user: Beta stands in the corner with a red dot, and a click on the dot, or "Turn off camera"
  in the popup, pauses the tab until it is reloaded, its address changes, or it is closed.
- Where the capture lives:
  - Chrome: an offscreen document (`USER_MEDIA`); the camera permission is given once on an extension page.
  - Firefox: there is no offscreen; a "Camera" extension tab (or a sidebar, to check); in the background without a new
    request, to check.
- Frames ~640×480, 30 frames per second (the SDK requires ≥25), RGBA over WS to `localhost:3001` (~37 MB/s; compression
  later), and on the server in memory only.

## The server

- **The SDK must be in a Worker** (`new Worker(...)` in Bun), not in the main thread of Elysia. The reasons (measured
  2026-11-19): `start()` blocks the JS thread for ~2 s, while frames come at 30 a second, ~1.2 MB each, so the main
  thread must only accept the WS and answer the extension. Main thread ⇄ Worker: `postMessage` with the frames as a
  transferable `ArrayBuffer` (no copy), and back come the gesture events, the status and the errors. Gesture
  recognition is in the same Worker, next to the metrics. To check first: does koffi (the SDK's native part) load in a
  Bun Worker; the fallback is a separate process (`Bun.spawn` + IPC) with the same message protocol.
- One SDK session per process (and per Worker), `faceMetrics`, telemetry off, the key in `apps/server/.env.local`.
- The neutral pose is calibrated at the start of each turn-on; gestures use a confidence threshold; only events go to
  the extension.
- Camera on an event = `start()` on turn-on and `stopAsync()` on turn-off. A pause in frames without `stop()` breaks
  the session (`kTimestampGap` on every frame), checked 2026-11-19.
- A person who sits close gets the SDK's advice "place more of the chest in view" and no pulse. The camera page
  (`apps/wxt/src/lib/camera/zoom-out.ts`) shrinks the picture into the middle of the frame, with black margins, in steps
  (1, 0.8, 0.65, 0.5, 0.4, every 2.5 s while the advice stands, back up on "face too far"); only for sessions that
  measure the pulse. Face landmarks of the mask are mapped back to the whole frame; the brightness check ignores
  the margins. Checked on a recorded clip (2026-11-24): the pulse came at 70% and 55%, and not at 100%.
- The warm-up, measured: `start()` ~2 s (blocks the server's JS thread) + ~1.2 s from the first frame to an expression
  ≈ 3–4 s until `ask()` is ready. Frames at least 25 a second (otherwise `kSustainedLowFrameRate`).
- `sendFrame` throws on an error: `#lib/spectra-sdk` catches it, sets `session.failed` and returns `false`; the Worker
  closes the session and creates a new one at the next camera turn-on.

## Running

- `bun install`, the key in `apps/server/.env.local`, `bun run dev`.
- Chrome: load `apps/wxt/.output/chrome-mv3`, turn on "Allow User Scripts". Firefox: `bun run build:firefox` in
  `apps/wxt`, load a temporary add-on, allow scripts.
- Install the scripts from `examples/` by loading the files.
- Linux: the SDK requires glibc ≥ 2.35.

## Scope of the contest version

**We do:** a runtime with `onVisible`, `onGesture`, `cooldown`, `ask`, `toast`; the gestures `nod`, `shake`, `tilt-*`,
`smile`, `confused`; a list and install by file; the camera on an event + the camera of always scripts; two examples
(a service rating, scrolling); `reactions.d.ts` and a prompt for an agent "write a script".

**Later (mention in the post):** TS scripts, an MCP tool `install_reaction` for agents, a wink, a catalogue of scripts,
updating by URL.

## Risks and what to check first

1. **The warm-up** at a turn-on on an event ≈ 3–4 s (measured above): in the overlay "looking…" and the mouse buttons;
   count the `ask` timeout from readiness. To shorten it, `.prepare(selector)`: start the SDK ahead of time, when the
   page or an element foretells a modal. A blocking `start()` — maybe move the SDK into a Worker.
2. A nod, a shake and a tilt from 478 points (the layout is not documented), the noise of `expression`.
3. `userScripts` + messaging + `CustomEvent` between worlds — build a minimal example in Chrome and Firefox.
4. Firefox: the camera without offscreen.
5. **Overlaps:** scrolling with the head — Glimra (#68), blink commands — OnBlink (#43), Hear Me (#92). The difference
   is programmable reactions that an agent writes, and the camera on an event.

## Consent and Data Handling (points for the post)

- The camera is on only while a script is asking, or while the page that a user-installed always script works on is
  open and active. Installing a script with `@camera always` is consent; the install dialog and the script card say so
  directly. While the camera works, Beta stands on the page with a red dot and the script's name; pausing takes one
  click (on the dot or with the button in the popup).
- Every turn-on is visible in the overlay with the script's name; answering with the mouse is possible too.
- Before installing, a script shows its code, its sites and which signals it uses; on/off and delete take one click.
- The video goes only to `localhost`, is processed in memory and is not saved. Scripts get gestures (`smile`, `nod`) and
  measurements (`blink`, `pose`, `expression`, `pulse`), without the video and without face points.
- A script gets a measurement only if it declared it in `@signals`; the install dialog lists them, with the note "not a
  medical reading" for `pulse`. The server's session set includes only the requested signals: without
  `@signals pulse` the SDK's `cardio` metrics are not turned on (`docs/signals.md`).
- A script works inside the page and can pass what it gets on, like any page script: so install only scripts you trust;
  the extension and the server send and save nothing themselves.
- SDK telemetry is off by default (`SMARTSPECTRA_TELEMETRY` in the server's `.env`, turned on only explicitly). The SDK
  still contacts SmartSpectra to check the API key. No medical conclusions: the pulse is an estimate from
  video, scripts must not make diagnoses; `blink` is not yet checked on real blinks.
