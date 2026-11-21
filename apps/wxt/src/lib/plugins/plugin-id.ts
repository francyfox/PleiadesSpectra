const HASH_BASE = 36;

/** FNV-1a 32-bit: short, stable and good enough to tell sources apart. */
function hashText(text: string): string {
	let hash = 0x811c9dc5;
	for (const char of text) {
		hash ^= char.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(HASH_BASE);
}

function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "plugin"
	);
}

/** Same name and source always give the same id; an edited source is a new script. */
export function createPluginId(name: string, source: string): string {
	return `${slugify(name)}-${hashText(source)}`;
}
