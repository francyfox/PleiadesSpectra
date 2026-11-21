import type { PropsWithChildren } from "@kitajs/html";
import { classNames } from "./class-names";

export type CardProps = PropsWithChildren<JSX.HtmlTag>;

export function Card({ class: className, children, ...attributes }: CardProps) {
	return (
		<div class={classNames("ui-card", className as string)} {...attributes}>
			{children}
		</div>
	);
}
