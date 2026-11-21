import type { PropsWithChildren } from "@kitajs/html";
import { classNames } from "./class-names";

export type IconProps = PropsWithChildren<
	JSX.HtmlTag & {
		/** Accessible name, also the hover tooltip. */
		label: string;
		size?: number;
	}
>;

/** A 24×24 monochrome icon that follows the text color, so it works in both themes. */
export function Icon({
	label,
	size = 16,
	class: className,
	children,
	...attributes
}: IconProps) {
	return (
		<svg
			class={classNames("ui-icon", className as string)}
			viewBox="0 0 24 24"
			width={size}
			height={size}
			fill="currentColor"
			fill-rule="evenodd"
			role="img"
			aria-label={label}
			{...attributes}
		>
			<title>{label}</title>
			{children}
		</svg>
	);
}
