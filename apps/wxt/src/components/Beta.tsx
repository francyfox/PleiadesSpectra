import { BetaFace, type BetaFaceProps } from "./BetaFace";
import { BetaLabel } from "./BetaLabel";
import { CameraBadge } from "./CameraBadge";

/**
 * Beta with the status pill below her. The widget scope sets her place and size as classes (`beta--top-left`,
 * `beta--large`, …), so a page or a theme can restyle them.
 */
export function Beta(props: BetaFaceProps) {
	return (
		<div
			class="beta"
			x-bind:class="betaClass"
			x-bind:style="betaStyle"
			x-show="isVisible"
			x-cloak=""
		>
			<CameraBadge />
			<BetaFace {...props} />
			<BetaLabel status="betaLabel" />
		</div>
	);
}
