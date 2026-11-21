import type { PropsWithChildren } from "@kitajs/html";
import { classNames } from "./class-names";

export type ToastProps = PropsWithChildren<JSX.HtmlTag>;

export function Toast({
	class: className,
	children,
	...attributes
}: ToastProps) {
	return (
		<div
			class={classNames("ui-toast", className as string)}
			role="status"
			aria-live="polite"
			{...attributes}
		>
			{children}
		</div>
	);
}
