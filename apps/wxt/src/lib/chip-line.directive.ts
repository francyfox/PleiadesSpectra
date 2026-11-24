import { Alpine } from "./alpine";
import { visibleChipCount } from "./chip-line";

const MORE_CLASS = "plugin__chips-more";

/** Sent by `x-resize` on the row (see `chipLineResize`) when its width changes. */
const RESIZED_EVENT = "chip-line:resized";

/** Attributes of a row that is fitted again when its width changes. */
export const chipLineResize = {
	"x-chip-line": "",
	"x-resize": `$dispatch('${RESIZED_EVENT}')`,
};

function chipsOf(row: HTMLElement): HTMLElement[] {
	return Array.from(
		row.querySelectorAll<HTMLElement>(`:scope > .ui-chip:not(.${MORE_CLASS})`),
	);
}

function createMoreChip(row: HTMLElement): HTMLElement {
	const more = document.createElement("span");
	more.className = `ui-chip ${MORE_CLASS}`;
	more.hidden = true;
	row.append(more);
	return more;
}

/** Shows the chips of a row on one line; the ones that do not fit are hidden and a `+N` chip counts them. */
function fitRow(row: HTMLElement, more: HTMLElement): void {
	const chips = chipsOf(row);
	for (const chip of chips) chip.hidden = false;
	more.hidden = true;
	if (chips.length === 0) return;

	const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
	const moreWidth = (hidden: number) => {
		more.textContent = `+${hidden}`;
		more.hidden = false;
		const width = more.offsetWidth;
		more.hidden = true;
		return width;
	};
	const count = visibleChipCount(
		chips.map((chip) => chip.offsetWidth),
		row.clientWidth,
		gap,
		moreWidth,
	);
	chips.forEach((chip, index) => {
		chip.hidden = index >= count;
	});
	if (count < chips.length) {
		more.textContent = `+${chips.length - count}`;
		more.hidden = false;
	}
}

/**
 * `x-chip-line` on a row of chips: one line, and a `+N` chip at the end when some do not fit. The row is fitted again
 * when `x-resize` reports its width (spread `chipLineResize` to get both) or its chips change (the chips come from
 * `x-for`, so they appear after the row does).
 */
export function registerChipLineDirective(): void {
	Alpine.directive("chip-line", (el, _value, { cleanup }) => {
		const row = el as HTMLElement;
		const more = createMoreChip(row);
		let frame = 0;
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => fitRow(row, more));
		};

		const changes = new MutationObserver(schedule);
		changes.observe(row, { childList: true });
		row.addEventListener(RESIZED_EVENT, schedule);
		schedule();

		cleanup(() => {
			cancelAnimationFrame(frame);
			changes.disconnect();
			row.removeEventListener(RESIZED_EVENT, schedule);
		});
	});
}
