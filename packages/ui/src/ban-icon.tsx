import { Icon, type IconProps } from "./icon";

const outline = {
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

/** The `ban` icon of Lucide (ISC licence, https://lucide.dev). */
export function BanIcon(props: Omit<IconProps, "children">) {
	return (
		<Icon {...outline} {...props}>
			<circle cx="12" cy="12" r="10" />
			<path d="m4.9 4.9 14.2 14.2" />
		</Icon>
	);
}
