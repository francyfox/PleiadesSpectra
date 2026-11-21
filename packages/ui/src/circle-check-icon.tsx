import { Icon, type IconProps } from "./icon";

const outline = {
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

/** The `circle-check` icon of Lucide (ISC licence, https://lucide.dev). */
export function CircleCheckIcon(props: Omit<IconProps, "children">) {
	return (
		<Icon {...outline} {...props}>
			<circle cx="12" cy="12" r="10" />
			<path d="m9 12 2 2 4-4" />
		</Icon>
	);
}
