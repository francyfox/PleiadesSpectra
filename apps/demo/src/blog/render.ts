import type { Article } from "./articles";

const STYLES = `
  body { font-family: system-ui, sans-serif; max-width: 680px; margin: 0 auto; padding: 0 16px 64px; line-height: 1.6; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 24px 0; border-bottom: 1px solid #ddd; margin-bottom: 24px; }
  header a { color: inherit; text-decoration: none; font-weight: 700; font-size: 20px; }
  button { font: inherit; padding: 8px 14px; cursor: pointer; }
  article { margin-bottom: 28px; }
  article h2 { margin: 0 0 4px; }
  .meta { color: #666; font-size: 14px; }
  .modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.4); }
  .modal.closed { display: none; }
  .modal__box { background: #fff; color: #111; border-radius: 12px; padding: 20px; width: min(360px, 90vw); }
  .scale { display: flex; gap: 12px; margin: 16px 0; }
  .scale label { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; }
  .demos { color: #666; font-size: 13px; margin-top: 32px; }
  #result { font-weight: 600; }
`;

const RATING_MODAL = `
<div id="rating-modal" class="modal closed" role="dialog" aria-modal="true" aria-labelledby="rating-title">
  <div class="modal__box">
    <h2 id="rating-title">How do you like our blog?</h2>
    <form id="rating-form">
      <div class="scale">
        ${[1, 2, 3, 4, 5]
					.map(
						(score) =>
							`<label><input type="radio" name="rating" value="${score}"${score === 1 ? " required" : ""} />${score}</label>`,
					)
					.join("\n        ")}
      </div>
      <button type="submit">Send</button>
      <button type="button" id="close-rating">Cancel</button>
    </form>
  </div>
</div>
<script>
  const modal = document.querySelector("#rating-modal");
  const result = document.querySelector("#result");
  document.querySelector("#open-rating").addEventListener("click", () => {
    result.textContent = "";
    modal.classList.remove("closed");
  });
  document.querySelector("#close-rating").addEventListener("click", () => modal.classList.add("closed"));
  document.querySelector("#rating-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const score = new FormData(event.target).get("rating");
    result.textContent = "Thanks! You rated us " + score + " of 5.";
    modal.classList.add("closed");
    event.target.reset();
  });
</script>`;

function layout(title: string, body: string): string {
	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <header>
      <a href="/">Demo blog</a>
      <button id="open-rating" type="button">Rate us</button>
    </header>
    <p id="result" role="status"></p>
    ${body}
    ${RATING_MODAL}
  </body>
</html>`;
}

export function renderIndex(articles: Article[]): string {
	const items = articles
		.map(
			(article) => `<article>
      <h2><a href="/post/${article.slug}">${article.title}</a></h2>
      <div class="meta">${article.author} · ${article.date}</div>
      <p>${article.paragraphs[0]}</p>
    </article>`,
		)
		.join("\n    ");
	const demos = `<p class="demos"><a href="/sleep">Sleep screen (heart rate demo)</a> · <a href="/breathe">Breathe screen (breathing demo)</a></p>`;
	return layout(
		"Demo blog",
		`<h1>Latest posts</h1>\n    ${items}\n    ${demos}`,
	);
}

export function renderArticle(article: Article): string {
	const paragraphs = article.paragraphs
		.map((text) => `<p>${text}</p>`)
		.join("\n    ");
	return layout(
		`${article.title} · Demo blog`,
		`<article>
      <h1>${article.title}</h1>
      <div class="meta">${article.author} · ${article.date}</div>
      ${paragraphs}
      <p><a href="/">← All posts</a></p>
    </article>`,
	);
}
