import { Icon, type IconProps } from "./icon";

const outline = {
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

export function CopyIcon(props: Omit<IconProps, "label" | "children">) {
	return (
		<Icon label="Copy" {...outline} {...props}>
			<rect x="9" y="9" width="11" height="11" rx="2" />
			<path d="M5 15V6a2 2 0 0 1 2-2h9" />
		</Icon>
	);
}
