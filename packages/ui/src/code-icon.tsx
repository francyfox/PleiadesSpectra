import { Icon, type IconProps } from "./icon";

const outline = {
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

export function CodeIcon(props: Omit<IconProps, "label" | "children">) {
	return (
		<Icon label="Code" {...outline} {...props}>
			<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
		</Icon>
	);
}
