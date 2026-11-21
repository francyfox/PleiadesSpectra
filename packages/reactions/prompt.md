# Prompt: write a Pleiades Spectra script

You write a single-file browser script for the Pleiades Spectra extension. Use only plain JavaScript and the
global `reaction()` described in `reactions.d.ts` (attached). No imports, no `eval`, no external requests.

Rules:

1. Start the file with `// @ts-check`, then a header block that the extension reads without running your code:

   ```js
   // ==Reaction==
   // @name        Short human-readable name
   // @match       *://example.com/*        (one line per match pattern, at least one)
   // @camera      on-demand | always        (default on-demand)
   // @gestures    smile, confused           (every gesture the script uses)
   // @signals     blink, pose, pulse        (every signal the script reads: blink, pose, expression, pulse, breathing)
   // ==/Reaction==
   ```

2. Build the behaviour as one chain, `reaction("id").onVisible(...).onGesture(...)`. Modifiers (`cooldown`, `minConfidence`)
   apply to the triggers declared after them.
3. `@camera on-demand`: the camera is on only while `ctx.ask(...)` waits for an answer. Use it when the page itself
   shows the moment (a rating dialog, a confirmation). Always offer mouse buttons: `ask` does this for every
   expected gesture.
4. `@camera always` is only for `onGesture` triggers that need a constant camera (scrolling, media control).
   Use it only when on-demand is impossible, and keep `cooldown` high enough to avoid repeated actions.
5. Gestures: `nod`, `shake`, `tilt-down`, `tilt-up`, `roll-left`, `roll-right`, `smile`, `confused`, `talking`. There is no gaze.
   Head pose is only available as the `pose` signal. Never infer health or emotions beyond what is listed.
6. Handlers must be small and defensive: use optional chaining on DOM lookups, never throw on missing elements.
7. Signals are raw measurements: declare each one in `@signals` (with `@camera always`) and read it with
   `.onSignal("pose", ({ sample }) => ...)` or `ctx.signals` (`latest`, `history`, `blinks`, `poseChange`, `average`).
   Declare only what the script uses: `@signals` and `@gestures` are permissions, and a signal or gesture that is not
   declared never reaches the script (the runtime drops it and prints a warning once).
   Throttle noisy ones with `{ minIntervalMs }`. A reaction-wide `cooldown` also skips the samples in between, so
   count with `ctx.signals` and keep your own quiet period when a pattern spans several samples.
8. Pulse and breathing are not medical readings. Never diagnose, never give health advice, never show them as
   health data. `blink` has not been verified against real blinks yet, so do not build anything important on it.
9. `ctx.show("pulse" | "breathing", { position?, size? })` makes Beta stand on the page without a question and show
   the measurement (a heart and bpm, a pinwheel and br/m) until `ctx.hide()` or until the reaction stops. It needs
   the signal in `@signals` (`pulse` or `breathing`) and `@camera always`; without them nothing is shown. Pulse and
   breathing here are not medical readings: no health labels, no advice, no "normal" or "high" judgements.

Return only the script file.
