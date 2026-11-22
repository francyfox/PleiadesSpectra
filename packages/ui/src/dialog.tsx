import type { PropsWithChildren } from "@kitajs/html";
import { classNames } from "./class-names";
import { CloseIcon } from "./close-icon";
import { IconButton } from "./icon-button";

function closeEvents(onClose: string | undefined) {
	if (!onClose) return {};
	return {
		"x-on:mousedown.self": onClose,
		"x-on:keydown.escape.window": onClose,
	};
}

export type DialogProps = PropsWithChildren<
	JSX.HtmlTag & {
		/** Handler for the close button in the corner, e.g. the name of an Alpine method. */
		onClose?: string;
		/** Title area; shares one row with the close button, so a long title wraps instead of running under it. */
		header?: JSX.Element;
	}
>;

/**
 * Modal box over a dimmed backdrop. Visibility is the caller's job, e.g. `x-show`.
 * `onClose` also runs on Esc and when the backdrop is pressed. It runs on every Esc, even while the
 * dialog is hidden, so it must do nothing then. It listens to `mousedown`, not `click`, so selecting text
 * inside the dialog and releasing outside does not close it.
 */
export function Dialog({
	onClose,
	header,
	class: className,
	children,
	...attributes
}: DialogProps) {
	return (
		<div class="ui-dialog-backdrop" {...closeEvents(onClose)} {...attributes}>
			<div
				class={classNames("ui-dialog", className as string)}
				role="dialog"
				aria-modal="true"
			>
				<header class="ui-dialog__header">
					{header}
					<IconButton
						label="Close"
						class="ui-dialog__close"
						x-on:click={onClose}
					>
						<CloseIcon />
					</IconButton>
				</header>
				{children}
			</div>
		</div>
	);
}
