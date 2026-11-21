import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";

/** One-time page: the camera prompt cannot be shown from the hidden offscreen document. */
export function App() {
	return (
		<main class="permission">
			<Card class="permission__card">
				<h1>Camera access</h1>
				<p>
					Pleiades Spectra reads your face expression and head gestures from the
					camera only while a script asks a question. Video stays on this
					computer and is never saved.
				</p>
				<Button id="allow-camera">Allow camera</Button>
				<p id="permission-status" class="permission__status" />
			</Card>
		</main>
	);
}
