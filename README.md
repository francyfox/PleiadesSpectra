# PleiadesSpectra

A browser extension that turns your camera into a remote control for any web page. Entry for the Presage
SmartSpectra SDK Challenge. Small JavaScript **scripts** decide what a smile, a nod, a lean of the head, a pulse or a
breath does on a site; the SmartSpectra SDK runs in a small **local server**, because it has no browser version.

```
camera → extension → ws://localhost:3001 → server (SmartSpectra SDK) → gestures and signals → script on the page
```

- `apps/wxt`: the browser extension (WXT, Chrome and Firefox).
- `apps/server`: the local server (Elysia on Bun) that hosts the SDK session. API docs at <http://localhost:3001/docs>.
- `apps/demo`: demo pages to try the example scripts on (a blog, a black sleep screen, a breathing screen).
- `packages/reactions`: the script API. `example/scripts`: ready scripts.

## You need

- A SmartSpectra API key from <https://physiology.presagetech.com/auth/register>.
- Chrome or Firefox and a camera. Put your face and upper chest in the frame, evenly lit: pulse and breathing need it.
- Put the key in `apps/server/.env.local`:

```sh
SMARTSPECTRA_API_KEY=your-key
```

## 1. Run the server and the demo

### Option A: Docker Compose

```sh
docker compose up --build
```

The server is on `127.0.0.1:3001`, the demo on `127.0.0.1:4010` (change them with `SERVER_PORT` and `DEMO_PORT`).
The ports are published on this machine only. The key is read from `apps/server/.env.local` when the container starts
and is never copied into an image. The image needs glibc (the SDK's native library does), so it is built on
`oven/bun` and installs `mesa-vulkan-drivers`, a software Vulkan that the expression model needs when there is no GPU.
Tested on Linux x64 only (the SDK also ships a Linux arm64 build, not tried).

### Option B: Bun

```sh
bun install
bun run dev          # server (3001), demo (4010) and the extension in a dev browser
```

Without Docker in production mode: `bun run build`, then `cd apps/server/dist && bun install --production && bun index.js`
(the SDK is not in the bundle, it loads a native library).

## 2. Load the extension

```sh
bun run --cwd apps/wxt build            # Firefox: build:firefox
```

Chrome: open `chrome://extensions`, turn on Developer mode, press **Load unpacked** and choose
`apps/wxt/.output/chrome-mv3`. Then open the extension's **Details** and turn on **Allow User Scripts** (the extension runs
your scripts through the browser's user scripts API). `bun run dev` does the loading for you in a separate dev browser.

Open the popup: it shows the server status, a camera preview with its frame rate (the SDK needs 25 fps or more),
the face mask that the SDK found, and the **Spectra check**.

## 3. Make a script

A script is one plain `.js` file with a header and a chain. No imports, no build step.

```js
// ==Reaction==
// @name      Scroll by tilt
// @match     *://*/*
// @camera    always
// @gestures  tilt-down, tilt-up
// ==/Reaction==

reaction("scroll")
  .cooldown(400)
  .onGesture("tilt-down", () => scrollBy({ top: 400, behavior: "smooth" }))
  .onGesture("tilt-up", () => scrollBy({ top: -400, behavior: "smooth" }));
```

- **Install:** popup → **Scripts** → choose the file → read what it asks for → **Install**. Try the ready ones in
  `example/scripts` on the demo pages: `rate-our-service.js` (smile or nod to rate), `scroll-page.js` (head navigation),
  `heart-rate.js`, `breathing-pinwheel.js`.
- **Gestures:** `nod`, `shake`, `tilt-down`, `tilt-up`, `roll-left`, `roll-right`, `smile`, `confused`, `talking`.
  **Signals** (raw, declared in `@signals`): `blink`, `pose`, `expression`, `pulse`, `breathing`.
- **With an AI agent:** popup → **Connect to AI**, then ask the agent to write a script for a site. The agent can only
  *propose* it: you see the code, the sites and what it reads from your face, and press Install yourself. Give the
  agent `packages/reactions/prompt.md` and `packages/reactions/reactions.d.ts` (types for `// @ts-check`).
- **Full guide:** [`docs/usage.md`](docs/usage.md).

## Consent and data handling

- The camera is off until a script you installed needs it; a red dot and Beta, the mascot, show whenever it runs, and
  one click pauses it.
- Video goes only to the server on your own machine, is processed in memory and never saved.
- SDK telemetry is off by default (`SMARTSPECTRA_TELEMETRY`); the SDK still contacts Presage to check the API key.
- Scripts get only the gestures and signals they declare. Scripts are page code: install only ones you trust.
- Not a medical tool. Pulse and breathing are rough estimates from video.

## Development

```sh
bun run build         # turbo: server, demo, extension
bun run check-types
bun run lint          # Biome; lint:fix writes the fixes
bun run e2e           # Playwright in a real Chrome (google-chrome-stable, or set CHROME_PATH)
```

Aliases: in `apps/wxt` `@/…` is `apps/wxt/src`; in `apps/server` `#lib/…` and `#modules/…` are under `src/`.
Workspace packages are imported by name (`@repo/…`).
