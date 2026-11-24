import { createArticles } from "./blog/articles";
import { renderArticle, renderIndex } from "./blog/render";
import { DEMO_HOST, DEMO_PORT } from "./config";
import { renderSleepScreen } from "./screens/render";

/**
 * Serves the demo pages for trying the example scripts (`bun run dev` starts it with the other apps), at
 * http://localhost:4010 unless `DEMO_PORT` says otherwise.
 * It must be a real http page: the extension's own pages (the test bench) cannot run scripts.
 */
const articles = createArticles();
const articleBySlug = new Map(
	articles.map((article) => [article.slug, article]),
);

function html(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

Bun.serve({
	port: DEMO_PORT,
	hostname: DEMO_HOST,
	fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname === "/") return html(renderIndex(articles));
		if (pathname === "/sleep") return html(renderSleepScreen());

		const slug = pathname.match(/^\/post\/([^/]+)$/)?.[1];
		const article = slug ? articleBySlug.get(slug) : undefined;
		return article ? html(renderArticle(article)) : html("Not found", 404);
	},
});

console.log(`Demo pages: http://localhost:${DEMO_PORT}`);
