/** Joins class names, skipping empty values. */
export function classNames(
	...names: Array<string | false | undefined>
): string {
	return names.filter(Boolean).join(" ");
}
