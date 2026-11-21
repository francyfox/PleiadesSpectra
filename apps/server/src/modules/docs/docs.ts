import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { config } from "#modules/config/config";
import { buildAsyncApiDocument } from "./asyncapi";
import {
	buildDocsInfo,
	buildDocsServers,
	DOCS_ASYNCAPI_PATH,
	DOCS_PATH,
	DOCS_SPEC_PATH,
	DOCS_TAGS,
	HIDDEN_FROM_DOCS,
	SCALAR_BUNDLE_VERSION,
	scalarSources,
} from "./docs.utils";

/** Serves the AsyncAPI document of the WebSocket routes; it is not part of the OpenAPI spec. */
const asyncApiPlugin = new Elysia({ name: "docs-asyncapi" }).get(
	DOCS_ASYNCAPI_PATH,
	() =>
		new Response(JSON.stringify(buildAsyncApiDocument(config.PORT)), {
			headers: { "content-type": "application/json" },
		}),
	{ detail: HIDDEN_FROM_DOCS },
);

/** OpenAPI documentation with the Scalar client. Register it before the routes it should describe. */
export const docsPlugin = new Elysia({ name: "docs" }).use(asyncApiPlugin).use(
	openapi({
		provider: "scalar",
		path: DOCS_PATH,
		specPath: DOCS_SPEC_PATH,
		scalar: {
			version: SCALAR_BUNDLE_VERSION,
			sources: scalarSources(),
		},
		documentation: {
			info: buildDocsInfo(),
			servers: buildDocsServers(config.PORT),
			tags: DOCS_TAGS,
		},
	}),
);
