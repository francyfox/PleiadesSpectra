/// <reference types="@kitajs/html/alpine.d.ts" />

// @alpinejs/csp ships no types; it has the same API as alpinejs.
declare module "@alpinejs/csp" {
	import Alpine from "alpinejs";
	export default Alpine;
}
