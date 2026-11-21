import type { PropsWithChildren } from "@kitajs/html";
import { classNames } from "./class-names";

export type ButtonVariant = "primary" | "ghost" | "danger";

export type ButtonProps = PropsWithChildren<
	JSX.HtmlButtonTag & { variant?: ButtonVariant }
>;

export function Button({
	variant = "primary",
	class: className,
	children,
	...attributes
}: ButtonProps) {
	return (
		<button
			type="button"
			class={classNames(
				"ui-button",
				`ui-button--${variant}`,
				className as string,
			)}
			{...attributes}
		>
			{children}
		</button>
	);
}
