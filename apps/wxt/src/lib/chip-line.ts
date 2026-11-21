/**
 * How many chips of a row stay when the row is one line wide: all of them if they fit, otherwise as many as fit
 * together with the `+N` chip that says how many were left out.
 *
 * @param widths the width of each chip
 * @param available the width of the line
 * @param gap the space between two chips
 * @param moreWidth the width of the `+N` chip for `hidden` chips left out
 */
export function visibleChipCount(
	widths: readonly number[],
	available: number,
	gap: number,
	moreWidth: (hidden: number) => number,
): number {
	const all = widths.reduce((sum, width) => sum + width, 0);
	const withGaps = all + gap * Math.max(0, widths.length - 1);
	if (withGaps <= available) return widths.length;

	for (let count = widths.length - 1; count > 0; count--) {
		const shown = widths.slice(0, count).reduce((sum, width) => sum + width, 0);
		const used = shown + gap * count + moreWidth(widths.length - count);
		if (used <= available) return count;
	}
	return 0;
}
