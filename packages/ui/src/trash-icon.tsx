import { Icon, type IconProps } from "./icon";

const outline = {
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

export function TrashIcon(props: Omit<IconProps, "label" | "children">) {
	return (
		<Icon label="Delete" {...outline} {...props}>
			<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6" />
		</Icon>
	);
}
