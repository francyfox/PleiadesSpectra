import type { PropsWithChildren } from "@kitajs/html";
import { classNames } from "./class-names";

export type IconButtonProps = PropsWithChildren<
	JSX.HtmlButtonTag & {
		/** Accessible name, also the hover tooltip. */
		label: string;
	}
>;

/** A square button that holds only an icon. */
export function IconButton({
	label,
	class: className,
	children,
	...attributes
}: IconButtonProps) {
	return (
		<button
			type="button"
			class={classNames("ui-icon-button", className as string)}
			aria-label={label}
			title={label}
			{...attributes}
		>
			{children}
		</button>
	);
}
