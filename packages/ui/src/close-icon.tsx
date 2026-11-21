import { Icon, type IconProps } from "./icon";

const outline = {
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.5",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

export function CloseIcon(props: Omit<IconProps, "label" | "children">) {
	return (
		<Icon label="Close" {...outline} {...props}>
			<path d="M6 6l12 12M18 6L6 18" />
		</Icon>
	);
}
