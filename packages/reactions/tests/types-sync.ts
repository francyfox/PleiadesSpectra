import type { Reaction, ReactionOptions } from "../src/types";

/** Compile-time check: `reactions.d.ts` and `src/types.ts` describe the same `reaction()`. */
declare const fromDeclarationFile: typeof reaction;

export const asSource: (name: string, options?: ReactionOptions) => Reaction =
	fromDeclarationFile;

declare const fromSource: (name: string, options?: ReactionOptions) => Reaction;

export const asDeclaration: typeof reaction = fromSource;
