/** A plain JSON object: AsyncAPI documents are built from these and served as JSON. */
export type JsonObject = Record<string, unknown>;

/** An example as written for OpenAPI: a name-less `summary` and the `value` itself. */
export interface NamedExample {
	summary: string;
	value: unknown;
}

/** `{ $ref }` to a place inside the AsyncAPI document, e.g. `components/messages/StreamStart`. */
export function ref(documentPath: string): JsonObject {
	return { $ref: `#/${documentPath}` };
}

/**
 * Drops everything JSON cannot carry. TypeBox schemas hold symbol keys (`Kind`, `Optional`) next to the
 * JSON Schema keywords, so a round trip leaves the plain draft-07 schema that AsyncAPI accepts.
 */
export function toPlainSchema(schema: object): JsonObject {
	return JSON.parse(JSON.stringify(schema)) as JsonObject;
}

/** The chosen OpenAPI-style examples as AsyncAPI message examples (`name`, `summary`, `payload`). */
export function toMessageExamples(
	examples: Record<string, NamedExample>,
	names: string[],
): JsonObject[] {
	return names.map((name) => ({
		name,
		summary: examples[name]?.summary,
		payload: examples[name]?.value,
	}));
}

interface OperationInput {
	action: "send" | "receive";
	channel: string;
	message: string;
	title: string;
	summary: string;
	tag: string;
}

/** One AsyncAPI operation on one message of a channel, from the point of view of this server. */
export function operationOf(input: OperationInput): JsonObject {
	return {
		action: input.action,
		channel: ref(`channels/${input.channel}`),
		title: input.title,
		summary: input.summary,
		tags: [{ name: input.tag }],
		messages: [ref(`channels/${input.channel}/messages/${input.message}`)],
	};
}

interface MessageInput {
	title: string;
	summary: string;
	contentType: string;
	schemaName: string;
	examples: JsonObject[];
}

/** A component message whose payload is the component schema `schemaName`. */
export function messageOf(input: MessageInput): JsonObject {
	return {
		title: input.title,
		summary: input.summary,
		contentType: input.contentType,
		payload: ref(`components/schemas/${input.schemaName}`),
		...(input.examples.length > 0 && { examples: input.examples }),
	};
}

/** `ready` becomes `Ready`; used to build component names such as `StreamReady`. */
export function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
