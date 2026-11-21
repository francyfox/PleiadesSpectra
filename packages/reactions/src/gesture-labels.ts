import type { AskOption, Gesture } from "@repo/protocol";

interface GestureLabel {
	label: string;
	gestureLabel: string;
}

const GESTURE_LABELS: Record<Gesture, GestureLabel> = {
	nod: { label: "Yes", gestureLabel: "↕ nod" },
	shake: { label: "No", gestureLabel: "↔ shake head" },
	"tilt-down": { label: "Down", gestureLabel: "⬇ tilt down" },
	"tilt-up": { label: "Up", gestureLabel: "⬆ tilt up" },
	"roll-left": { label: "Left", gestureLabel: "↶ lean left" },
	"roll-right": { label: "Right", gestureLabel: "↷ lean right" },
	smile: { label: "Good", gestureLabel: "🙂 smile" },
	confused: { label: "Not sure", gestureLabel: "🤔 confused" },
	talking: { label: "Speak", gestureLabel: "🗣 talking" },
};

export function optionFor(
	gesture: Gesture,
	labels: Partial<Record<Gesture, string>> = {},
): AskOption {
	const defaults = GESTURE_LABELS[gesture];
	return {
		value: gesture,
		label: labels[gesture] ?? defaults.label,
		gestureLabel: defaults.gestureLabel,
	};
}
