# AI agent connector

Revision of 2026-11-20. Built the way SheetCanvas does it (`github.com/tektrg/sheetcanvas`; studied:
`backend/src/mcp/route.ts`, `backend/src/mcp/bridge.ts`, `src/agent/useMcpBridge.ts`,
`src/components/ConnectAgentDialog.tsx`). The contract in code: `packages/protocol/src/agent-link.ts`.

## How SheetCanvas does it

1. The UI creates a **secret token** (24 bytes, 48 hex characters) and shows the URL `https://…/mcp/<token>`. The token
   is a password: "anyone with this URL can read and modify this canvas". There is a "Regenerate URL (revokes the
   current one)" action.
2. While the **"Expose to agents"** checkbox is on, the browser tab holds one **WebSocket** to the backend. Connection
   open = "open to agents", connection closed = "closed". **The live state belongs to the tab**; the backend only
   relays.
3. The agent (Claude Code, Codex) calls `POST /mcp/<token>` (MCP, JSON-RPC over HTTP, no SSE, no batching).
   The backend validates `tools/call` against a shared schema (zod) and forwards it to the tab as
   `{ id, name, input }`; the tab runs it and answers `{ id, ok, result | error }`.
4. Bridge details: one socket per token (a new tab displaces the old one with close code 4000, and the old one does
   **not** reconnect); calls run one at a time; a call times out after 30 s; when the socket drops, every waiting call
   fails with a clear error; `ping`/`pong` heartbeat every 20 s (no pong for 10 s → close and reconnect); reconnect
   with exponential backoff from 1 s to 30 s.
5. With no tab connected, a tool returns the error "Canvas not connected. Open your tab and enable “Expose to
   agents”". The `instructions` field of the `initialize` answer gives the agent the same hint. For writes: "if a
   write timed out, read first, then retry".
6. The "Connect Claude or Codex" dialog: a "Generate agent connection URL" button, a status dot (connected /
   connecting / disconnected / replaced), an "Expose to agents" checkbox, copy fields "Agent server URL" and
   `claude mcp add sheetcanvas --transport http <url>`, and a link to the instructions.
7. Tool descriptions live in one place and are used by both the backend (`tools/list`, validation) and the tab
   (rejecting an unknown name); each has `readOnlyHint` / `destructiveHint`.

## What we do

| SheetCanvas                                        | Pleiades Spectra                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cloudflare backend, a Durable Object per token     | `apps/server` (Bun, Elysia), one in-memory bridge per token                                         |
| The canvas tab holds the WebSocket                 | **The extension's Scripts page** (a tab, not the service worker: that one goes to sleep)            |
| `POST /mcp/<token>`                                | `POST http://localhost:3001/mcp/<token>`                                                            |
| WS `/api/mcp/bridge/<token>`                       | WS `ws://localhost:3001/agent/<token>`                                                              |
| The server issues the token                        | The extension creates the token (`crypto.getRandomValues`, 24 bytes → 48 hex), keeps it in `storage.local` |
| Canvas, tables, charts                             | Installed scripts                                                                                   |

### Tools

| Tool                          | Runs on        | What it does                                                                                                                                                                                                  |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_script_guide`            | server         | the rules, `reactions.d.ts` and the examples from `@repo/reactions`, so the agent knows how to write a script                                                                                                 |
| `validate_script({ source })` | server         | parses the header with `parseHeader`; the code is **not executed**                                                                                                                                            |
| `list_scripts`                | Scripts page   | `PluginSummary[]`: id, whether it is enabled, header                                                                                                                                                          |
| `get_script({ id })`          | Scripts page   | the full code of an installed script (to improve it)                                                                                                                                                          |
| `propose_script({ source })`  | Scripts page   | the server checks the header; the page opens the **ordinary install dialog** marked "Proposed by an AI agent"; the tool answers once the user has decided: `installed` / `declined`, or `pending` after 120 s |

The agent **never installs a script itself**, and never enables, disables or deletes one. A script runs code on the
pages of websites, so the decision is the user's (the dialog shows the code, the sites and the camera mode). The tool
descriptions and input schemas (zod) live in one module, `packages/protocol`, which the server and the extension both
use.

### The bridge (as in SheetCanvas)

- Server → page: `{ id, name, input }` (type `BridgeRequest`). Page → server: `{ id, ok: true, result }` or
  `{ id, ok: false, error }` (`BridgeResponse`). Text `ping` / `pong` for the heartbeat.
- One socket per token; a new one displaces the old one with code `4000` (`BRIDGE_CLOSE_REPLACED`), and the displaced
  page does not reconnect. Calls run one at a time. The timeout is 30 s (`BRIDGE_REQUEST_TIMEOUT_MS`);
  `propose_script` waits up to 120 s (`PROPOSAL_WAIT_MS`). A dropped socket → waiting calls get an error.
- Connecting to `/agent/<token>` = "Expose to agents" is on. Closing = off.
- The server accepts any valid token from the extension's socket (there is one local user). `/mcp/<token>` answers
  only for tokens that a page has connected with before: an unknown token → 404 with no hints, compared in constant
  time. When the toggle is off, the URL stays known: tools that need the page return the hint "turn on Expose to
  agents". "Regenerate" closes the socket with code 4001 (`BRIDGE_CLOSE_REVOKED`) and the server forgets the old token
  (if the toggle was off at that moment, the old token lives until the server restarts: it cannot hand out any data,
  because there is no page).
- No page connected → the tool returns `isError`: "Open the Scripts page in the extension and turn on “Expose to
  agents”". The same text is in the `instructions` of the `initialize` answer.

### The MCP endpoint

`POST /mcp/<token>`, stateless Streamable HTTP through `@modelcontextprotocol/sdk` (already a dependency of the
server). `GET` and `DELETE` answer 405. The protocol and the response format are the same as SheetCanvas: one JSON-RPC
request at a time.

### Security

- **The token is a password.** It is shown once in the dialog with a warning; "Regenerate" revokes the old one.
- A localhost server is visible to any website, so: `/mcp/*` rejects (403) any request with a browser `Origin` (MCP
  clients do not send `Origin`); the WS `/agent/*` accepts only `chrome-extension://` and `moz-extension://` (the
  browser does not let a page forge the `Origin` of a WebSocket); `Host` must be loopback (protection against DNS
  rebinding); the server listens on `127.0.0.1`.
- Script contents are not logged. `source` is at most 64 KB.
- The agent sees no video, no face points and no expressions: the connector works with scripts only. For the Consent
  and Data Handling section: connecting an agent is a separate, explicit action (generating a URL + the toggle), and
  installing each script is a separate confirmation.

## Interface (the Scripts page)

The **"Connect AI agent"** button in the page header (next to "How to create script") opens a dialog:

1. While there is no token: a "Generate agent connection URL" button.
2. A status dot: `connected` (the page holds the socket) / `connecting` / `disconnected` / `replaced` ("Another Scripts
   tab took over — toggle off and on here to reclaim"), and an "Expose to agents" checkbox/toggle.
3. Fields with a Copy button: "Agent server URL" (`http://localhost:3001/mcp/<token>`) and "Add to Claude Code"
   (`claude mcp add --transport http pleiades <url>`).
4. "Regenerate URL (revokes the current one)".
5. A warning: "Anyone with this URL can ask your extension to propose scripts while the toggle is on. Treat it like a
   password. Scripts are never installed without your confirmation. Keep this page open while your agent works."

While the dialog is closed but the toggle is on, the Scripts page keeps holding the socket (like the SheetCanvas tab).
An agent's proposal opens the same install dialog: the mark "Proposed by an AI agent", the Install / Cancel buttons; the
decision goes back to the agent as the result of `propose_script`.

The "Let an AI agent do it for you" section in the "How to create script" modal leads to this dialog (the "Connect AI
agent" button) and no longer holds a static address.

## What to remove from what was already done

The implementation of the first iteration (a queue of proposals + polling) is replaced, so that there are not two
mechanisms:

- `apps/server`: the proposal queue, `GET/DELETE /agent/proposals`, their preflight, `PluginProposal` in `proposals.ts`.
  What stays and is reused: `check-plugin.ts`, `plugin-guide.ts`, `request-guard.ts`, `get_script_guide`,
  `validate_script`, the binding to `127.0.0.1`, the `mcp-check.ts` script (rewrite it for the token and the bridge).
- `apps/wxt`: `lib/agent/proposals.ts`, `merge-proposals.ts`, `proposal-watcher.ts`, the badge on the icon, `alarms`,
  `agent/resume-polling`, the line in the popup, the static address in the modal. The `http://localhost:3001/*`
  permission stays (the bridge and the server check).

## Order of work

1. Server: tokens in the path, the `/agent/<token>` bridge (registration, call queue, timeouts, displacement,
   heartbeat), MCP `/mcp/<token>`, five tools, a shared schema module, the guard, `mcp-check.ts`, tests of the business
   logic.
2. Extension: the bridge client on the Scripts page (token, toggle, reconnecting, heartbeat, handling of three tools),
   the "Connect AI agent" dialog, `propose_script` through the install dialog, removal of the first iteration, tests.
3. An end-to-end check by hand with a real client (Claude Code): add the URL, ask it to write a script, see the install
   dialog. The automatic tests only cover the logic and the server with a fake bridge.
