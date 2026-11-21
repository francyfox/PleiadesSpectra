import type { PropsWithChildren } from "@kitajs/html";
import { classNames } from "./class-names";

export type ChipProps = PropsWithChildren<JSX.HtmlTag>;

export function Chip({ class: className, children, ...attributes }: ChipProps) {
	return (
		<span class={classNames("ui-chip", className as string)} {...attributes}>
			{children}
		</span>
	);
}
