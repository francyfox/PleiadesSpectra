import { reaction } from "./index";

/** Entry of `dist/runtime.js`: the extension runs it before the script code. */
(globalThis as { reaction?: typeof reaction }).reaction = reaction;
