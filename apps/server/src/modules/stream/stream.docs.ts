import { MIN_FRAME_RATE } from "@repo/protocol";

const OVERVIEW = `
The browser extension streams camera frames here. The server feeds them to the SmartSpectra SDK, which computes face metrics (landmarks, expression, talking). The server turns them into **gestures** and sends gestures and session state back. Only live SDK signals are used; nothing is diagnosed or interpreted medically.

Connect to \`ws://127.0.0.1:<PORT>/ws\` (default port 3001). The server listens on the loopback interface only, so the socket is unreachable from other machines. There are no query parameters, headers or authentication.
`;

const LIFECYCLE = `
## Lifecycle

1. **Connect.** The socket opens; the server keeps an empty per-connection state. No session exists yet.
2. **Start.** The client sends the text message \`start\` with the frame size. Until the server has a session, binary frames are silently ignored.
3. **Warm-up.** The SDK starts in a worker thread (about 1-2 s, measured; the server gives up after 30 s). The first frames after that produce landmarks almost at once and the first expression about 1.2 s after the first frame (measured values, not a guarantee).
4. **Ready.** When the first expression arrives the server sends \`ready\` (once per session) and then \`expression\` messages. Head gestures additionally need the first 30 head-pose samples (about 1 s) as the neutral pose: keep the head still at the start.
5. **Streaming.** The client sends binary frames at **${MIN_FRAME_RATE} fps or more**. Below that the SDK reports \`kFrameRateTooLow\` and then fails. Do not pause frames while the session is open: after a gap of about 10 s the SDK rejects every frame (\`kTimestampGap\`). Stop and start again instead.
6. **Stop.** The client sends \`stop\` (camera off) or closes the socket. The server stops the SDK (waits up to 3 s) and drops the session state. \`stop\` is not answered.

Only **one session per server process** can run at a time (the SDK has process-global native state). A second client gets a retryable error until the first one stops.
`;

const CLIENT_MESSAGES = `
## Client to server

| Kind | Format | Fields |
| --- | --- | --- |
| \`start\` | text, JSON | \`type: "start"\`, \`width\` and \`height\` (integers 1-1920, the size of every frame), optional \`debug\` (boolean), optional \`signals\` (array of signal names, see Signals) |
| \`stop\` | text, JSON | \`type: "stop"\` |
| frame | binary | 8-byte header + RGBA pixels |

**Frame layout.** Total size must equal exactly \`8 + width * height * 4\` bytes (for 640x480: 1 228 808 bytes).

| Bytes | Content |
| --- | --- |
| 0-7 | timestamp, unsigned 64-bit little-endian integer, microseconds; monotonic and increasing |
| 8... | pixels, 4 bytes per pixel in RGBA order, row by row, no padding (stride = width * 4) |

Frames of any other size are dropped without an answer. A frame is also dropped when the SDK worker already has 4 frames in flight (a late frame is worse than a missing one). The server forces each timestamp above the previous one.

A \`start\` while a session exists or is starting is ignored. \`stop\` during start-up stops the session as soon as it is up. Text that is not valid JSON, has an unknown \`type\`, or breaks the field limits (e.g. \`width: 4000\`) is answered with the error \`Malformed message\`.
`;

const SERVER_MESSAGES = `
## Server to client (text, JSON)

| \`type\` | Fields | When |
| --- | --- | --- |
| \`ready\` | none | Once, when the first expression arrives |
| \`expression\` | \`scores\`: object with \`ANGRY\`, \`CONTEMPT\`, \`DISGUST\`, \`FEAR\`, \`HAPPY\`, \`NEUTRAL\`, \`SAD\`, \`SURPRISE\`, each 0-100 | At most every 100 ms |
| \`gesture\` | \`gesture\`, \`confidence\` (0-1) | When a gesture is recognised |
| \`signal\` | \`sample\`: \`signal\`, \`value\`, \`at\` | Only for signals requested in \`start.signals\`, see Signals |
| \`validation\` | \`code\` (SDK ValidationCode), \`hint\` (text) | When the SDK's verdict about the picture changes to something other than OK; not repeated while unchanged |
| \`error\` | \`message\`, \`retryable\` | Any failure, see below |
| \`metrics\` | \`metrics\`: decoded SDK payload | Only with \`debug: true\`, at most every 200 ms |

**Gestures.** Computed on the server from SDK landmarks, expression and talking flags.

| \`gesture\` | Meaning |
| --- | --- |
| \`nod\` | pitch oscillation of the head within about 1.2 s |
| \`shake\` | yaw oscillation of the head within about 1.2 s |
| \`tilt-down\`, \`tilt-up\` | head held away from the neutral pose for 0.4 s; repeats every 0.6 s while held |
| \`roll-left\`, \`roll-right\` | head leaned to the person's own left or right shoulder (about 15°) for 0.25 s; fires once, and the head must come back upright before the next one |
| \`smile\` | smoothed HAPPY score above 55 for 6 packets |
| \`confused\` | smoothed maximum of ANGRY, CONTEMPT, DISGUST, FEAR, SAD above 60 for 6 packets (SmartSpectra has no "confused" expression) |
| \`talking\` | talking detected for 0.3 s; repeats every 1 s while it continues |

Gestures have a cooldown between repeats (about 1 s).
`;

const SIGNALS = `
## Signals

\`start.signals\` lists the measurements the client wants as they are, so a script can set its own conditions. The server sends only those as \`{ "type": "signal", "sample": { "signal", "value", "at" } }\`; without \`signals\` there are none. Gestures and \`expression\` messages are independent of it and always sent. An unknown name makes the whole \`start\` malformed (\`Malformed message\`); duplicates are ignored. The set changes only by \`stop\` and a new \`start\`.

| \`signal\` | \`value\` | SDK source | Sent |
| --- | --- | --- | --- |
| \`blink\` | \`{ detected }\` | \`face.blinking\`; a missing field is false | Only when the value changes (the first one too); a rise to true is one blink |
| \`pose\` | \`{ yaw, pitch }\` | Computed from landmarks, relative to the rest pose, in eye distances; yaw grows to the image right, pitch downward | At most 15 per second, after the rest pose is set (first 30 poses, keep the head still) |
| \`expression\` | scores 0-100 per expression | \`face.expression\` | At most every 100 ms |
| \`pulse\` | \`{ bpm, confidence, stable }\` | \`cardio.pulseRate\`, newest sample | When the SDK gives a new timestamp |

\`at\` is milliseconds since the Unix epoch. For \`pulse\` it is the SDK's timestamp (microseconds divided by 1000); for \`blink\` too when the SDK provides one; for \`pose\` and \`expression\` it is server time.

**Metrics are opt-in.** Without \`pulse\` the SDK session does not request the cardio metric (PULSE_RATE), only face metrics are always on. The unavailable metrics (amplitude, apnea, baseline, ...) are never requested, as that fails \`start()\`.

**Caveats.** \`blink\` is not verified against real blinks (another project's live test got none). \`pulse\` is not a medical reading and must not be used for diagnosis, treatment or health advice; \`stable\` is the SDK's own verdict (pulse: confidence of at least 40), and the first value takes about 10-13 s after the face is found (the SDK's pulse window is 12 s; measured on recorded video). The pulse is physiological data: ask for it only when needed, and it goes only to the client that requested it. The SDK asks for a face that is not too big in the frame: a person who sits close gets \`validation\` advice about the chest and no pulse.
`;

const ERRORS = `
## Errors and closing

The server **never closes the socket itself and defines no custom close codes**: every failure is an \`error\` message and the socket stays open, so the client can fix the cause and send \`start\` again. Closing is always done by the client (or the network) with the standard WebSocket codes, e.g. 1000 or 1001. On close the server stops the session.

| \`message\` | \`retryable\` | Cause |
| --- | --- | --- |
| \`Malformed message\` | false | Text message is not valid JSON or does not match \`start\` / \`stop\` |
| \`SMARTSPECTRA_API_KEY is not set on the server\` | false | Server runs without an API key |
| \`A measurement session is already running\` | true | Another connection owns the SDK |
| \`SmartSpectra did not start in time\` | true | The SDK did not start within 30 s |
| text from the device readiness check | false | The SDK reports the device as blocked |
| text from the SDK, or from the worker | per SDK | Start-up failure or failure during measuring |

Failures during measuring (for example \`kFrameRateTooLow\`, \`kTimestampGap\`) arrive as \`error\` with the SDK's text. After a failed frame the SDK does not recover: frames are dropped, so send \`stop\` and then \`start\`.

\`\`\`json
{ "type": "error", "message": "A measurement session is already running", "retryable": true }
\`\`\`
`;

const CONSENT_AND_DATA = `
## Consent and data handling

- **Consent.** The server has no consent step of its own. The camera is opened by the extension through the browser's camera permission prompt. The server receives frames only after the client sends \`start\`, and stops when it sends \`stop\` or disconnects. Turn the camera off and send \`stop\` as soon as the user withdraws consent.
- **What is kept.** Nothing is written to disk and there is no database. Frame pixels exist only in memory: they are handed to the SDK worker and not copied anywhere else by this module. Per-connection state (frame size, gesture detector state, the neutral head pose) lives in memory and is discarded on \`stop\` or close. Frames and metrics are never logged by this module.
- **What is sent back.** Only to the same client: gestures, expression scores, the signals it requested (including pulse), validation hints, errors and, if the client asked with \`debug: true\`, the raw metrics.
- **Telemetry.** Off by default: the server starts the SDK with telemetry and accumulated output switched off (the SDK itself defaults to telemetry on). Set \`SMARTSPECTRA_TELEMETRY=true\` in the server's \`.env\` to let the SDK send session summaries and readiness reports; per the SmartSpectra documentation they can contain free text, paths and platform context, and no raw frames or measured vitals. The SDK also authenticates with the API key, so it may contact SmartSpectra services either way (see the SmartSpectra documentation).
- **Network.** Loopback only (127.0.0.1).
`;

/** Markdown description of the `/ws` channel in the AsyncAPI document. */
export const STREAM_CHANNEL_DESCRIPTION = [
	OVERVIEW,
	LIFECYCLE,
	CLIENT_MESSAGES,
	SERVER_MESSAGES,
	SIGNALS,
	ERRORS,
	CONSENT_AND_DATA,
].join("\n");
