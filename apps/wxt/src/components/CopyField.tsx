import { CheckIcon } from "@repo/ui/check-icon";
import { CopyIcon } from "@repo/ui/copy-icon";
import { IconButton } from "@repo/ui/icon-button";
import { Input } from "@repo/ui/input";

/** One line, cut off with an ellipsis, plus a button that copies the whole value. */
export function CopyField(props: {
	value: string;
	copy: string;
	isCopied: string;
	isNotCopied: string;
	label: string;
	show?: string;
}) {
	return (
		<div class="copy-field" x-show={props.show}>
			<Input readonly x-bind:value={props.value} aria-label={props.label} />
			<IconButton
				label={props.label}
				x-show="canCopy"
				x-cloak=""
				x-on:click={props.copy}
			>
				<CopyIcon x-show={props.isNotCopied} />
				<CheckIcon x-show={props.isCopied} x-cloak="" />
			</IconButton>
		</div>
	);
}
