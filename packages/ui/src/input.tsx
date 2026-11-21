import { classNames } from "./class-names";

export type InputProps = JSX.HtmlInputTag;

/** A text box. A long value is cut off by the box itself (ellipsis) and stays selectable. */
export function Input({ class: className, ...attributes }: InputProps) {
	return (
		<input
			type="text"
			class={classNames("ui-input", className as string)}
			{...attributes}
		/>
	);
}
