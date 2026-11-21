import { widgetPlaces } from "@repo/protocol";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { expressionNames } from "@/lib/emotion";

const phaseButtons = [
	{ action: "ask", label: "1. Ask (warm-up)" },
	{ action: "listening", label: "2. Listening" },
	{ action: "accepted", label: "3a. Accepted" },
	{ action: "timeout", label: "3b. Timeout" },
	{ action: "error", label: "3c. Error" },
	{ action: "hide", label: "Hide" },
];

/** Test bench: buttons publish the messages the background will send, the widget reacts below. */
/** The demo app (`apps/demo`), which `bun run dev` starts. */
/**
 * The build puts `DEMO_PORT` in `WXT_DEMO_PORT`; the dev server may not, and `http://localhost:undefined` is a link
 * that Chrome blocks as `about:blank#blocked`, so the default port stands in.
 */
const DEMO_PORT = import.meta.env.WXT_DEMO_PORT || "4010";
const DEMO_URL = `http://localhost:${DEMO_PORT}`;

/** The video that the heart rate script also works on. */
const VIDEO_URL = "https://youtu.be/dQw4w9WgXcQ";

const NEEDS_DEMO_SERVER = "Needs the demo app running (`bun run dev`)";

/** Where each example script can be tried: the pages of the demo server and the video. */
const DEMO_LINKS = [
	{ label: "Rating form", url: DEMO_URL, title: NEEDS_DEMO_SERVER },
	{
		label: "Heart rate: sleep screen",
		url: `${DEMO_URL}/sleep`,
		title: NEEDS_DEMO_SERVER,
	},
	{
		label: "Heart rate: video on YouTube",
		url: VIDEO_URL,
		title: "The heart rate script works on this video too",
	},
	{
		label: "Breathing: breathe screen",
		url: `${DEMO_URL}/breathe`,
		title: NEEDS_DEMO_SERVER,
	},
];

export function App() {
	return (
		<main class="bench">
			<h1>Widget test bench</h1>
			<p class="bench__hint">
				The widget is mounted the same way as in the content script (shadow root
				+ initTree). Expressions count only in the Listening phase, and the
				emotion changes at most once per 300 ms.
			</p>

			<Card class="bench__card">
				<h2>Phase</h2>
				<div class="bench__row">
					{phaseButtons.map(({ action, label }) => (
						<Button variant="ghost" data-action={action}>
							{label}
						</Button>
					))}
				</div>
			</Card>

			<Card class="bench__card">
				<h2>Place (asks again)</h2>
				<div class="bench__row">
					{widgetPlaces.map((place) => (
						<Button variant="ghost" data-action={`place:${place}`}>
							{place}
						</Button>
					))}
				</div>
			</Card>

			<Card class="bench__card">
				<h2>Size (asks again)</h2>
				<div class="bench__row">
					{["small", "medium", "large"].map((size) => (
						<Button variant="ghost" data-action={`size:${size}`}>
							{size}
						</Button>
					))}
				</div>
			</Card>

			<Card class="bench__card">
				<h2>Head gestures (pose for 900 ms)</h2>
				<div class="bench__row">
					{[
						"nod",
						"shake",
						"tilt-down",
						"tilt-up",
						"roll-left",
						"roll-right",
					].map((gesture) => (
						<Button variant="ghost" data-action={`gesture:${gesture}`}>
							{gesture}
						</Button>
					))}
				</div>
			</Card>

			<Card class="bench__card">
				<h2>Breathing (the pinwheel, 10 s)</h2>
				<div class="bench__row">
					{["8", "12", "20"].map((rate) => (
						<Button variant="ghost" data-action={`breathing:${rate}`}>
							{rate} breaths/min
						</Button>
					))}
				</div>
			</Card>

			<Card class="bench__card">
				<h2>Pulse (the heart, 10 s)</h2>
				<div class="bench__row">
					{["60", "90", "120"].map((bpm) => (
						<Button variant="ghost" data-action={`pulse:${bpm}`}>
							{bpm} bpm
						</Button>
					))}
					<Button variant="ghost" data-action="pulse-unstable">
						not stable yet
					</Button>
				</div>
			</Card>

			<Card class="bench__card">
				<h2>Show a vital (without a question)</h2>
				<div class="bench__row">
					<Button variant="ghost" data-action="show-vital:pulse">
						show pulse
					</Button>
					<Button variant="ghost" data-action="show-vital:breathing">
						show breathing
					</Button>
					<Button variant="ghost" data-action="hide-vital">
						hide
					</Button>
				</div>
			</Card>

			<Card class="bench__card">
				<h2>SDK expression (80%)</h2>
				<div class="bench__row">
					{expressionNames.map((name) => (
						<Button variant="ghost" data-action={`expression:${name}`}>
							{name}
						</Button>
					))}
				</div>
			</Card>

			<Card class="bench__card">
				<h2>Script demos</h2>
				<div class="bench__row">
					{DEMO_LINKS.map((link) => (
						<a href={link.url} target="_blank" rel="noreferrer">
							<Button variant="ghost" title={link.title}>
								{link.label}
							</Button>
						</a>
					))}
				</div>
			</Card>

			<Card class="bench__card">
				<h2>Widget replies</h2>
				<ul id="reply-log" class="bench__log" />
			</Card>
		</main>
	);
}
