import type { PropsWithChildren } from "@kitajs/html";
import { classNames } from "./class-names";

export type TabsProps = PropsWithChildren<JSX.HtmlTag>;

export type TabProps = PropsWithChildren<
	JSX.HtmlButtonTag & { selected?: boolean }
>;

/** The row of tabs. Which one is selected and what each one shows is the caller's job. */
export function Tabs({ class: className, children, ...attributes }: TabsProps) {
	return (
		<div
			class={classNames("ui-tabs", className as string)}
			role="tablist"
			{...attributes}
		>
			{children}
		</div>
	);
}

/** For a runtime state bind `x-bind:aria-selected` instead of the static `selected`. */
export function Tab({
	selected = false,
	class: className,
	children,
	...attributes
}: TabProps) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={String(selected)}
			class={classNames("ui-tab", className as string)}
			{...attributes}
		>
			{children}
		</button>
	);
}
