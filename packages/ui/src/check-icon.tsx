import { Icon, type IconProps } from "./icon";

const outline = {
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.5",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

export function CheckIcon(props: Omit<IconProps, "label" | "children">) {
	return (
		<Icon label="Copied" {...outline} {...props}>
			<path d="M5 12.5l4.5 4.5L19 7.5" />
		</Icon>
	);
}
