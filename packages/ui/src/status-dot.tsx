import { classNames } from "./class-names";

export type StatusTone = "off" | "busy" | "live" | "ok";

export type StatusDotProps = JSX.HtmlTag & { tone?: StatusTone };

/** The tone lives in `data-tone`, so it can be bound at runtime: `x-bind:data-tone="tone"`. */
export function StatusDot({
	tone = "off",
	class: className,
	...attributes
}: StatusDotProps) {
	return (
		<span
			class={classNames("ui-status-dot", className as string)}
			data-tone={tone}
			aria-hidden="true"
			{...attributes}
		/>
	);
}
