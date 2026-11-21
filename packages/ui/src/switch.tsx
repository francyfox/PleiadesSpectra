import type { PropsWithChildren } from "@kitajs/html";
import { classNames } from "./class-names";

export type SwitchProps = PropsWithChildren<
	JSX.HtmlButtonTag & { checked?: boolean }
>;

/** For a runtime state bind `x-bind:aria-checked` instead of the static `checked`. */
export function Switch({
	checked = false,
	class: className,
	children,
	...attributes
}: SwitchProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={String(checked)}
			class={classNames("ui-switch", className as string)}
			{...attributes}
		>
			<span class="ui-switch__track" aria-hidden="true" />
			{children}
		</button>
	);
}
