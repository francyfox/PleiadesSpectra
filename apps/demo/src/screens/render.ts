/** Opens the page with the given body styles and no scripts, so the only things on it are what a script adds. */
function screen(title: string, bodyStyles: string, body = ""): string {
	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      html, body { height: 100%; margin: 0; }
      body { ${bodyStyles} }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

/** A fully black page, no text, no cursor: a screen for the heart rate demo. */
export function renderSleepScreen(): string {
	return screen("Sleep screen", "background: #000; cursor: none;");
}
