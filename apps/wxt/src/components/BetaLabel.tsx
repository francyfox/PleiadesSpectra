import { classNames } from "@repo/ui/class-names";

export type BetaLabelSize = "small" | "medium" | "large";

export interface BetaLabelProps {
	/** Name of the Alpine property that holds the text, e.g. `emotionLabel`. */
	status: string;
	/** Without a size the label scales with the width of Beta around it. */
	size?: BetaLabelSize;
}

/** The pill with the current status of Beta, such as her emotion. */
export function BetaLabel({ status, size }: BetaLabelProps) {
	return (
		<div
			class={classNames("beta-label", size && `beta-label--${size}`)}
			x-text={status}
		/>
	);
}
