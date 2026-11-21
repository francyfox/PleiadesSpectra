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

/** A calm dark blue page with one big word: a screen for the breathing demo. */
export function renderBreatheScreen(): string {
	return screen(
		"Breathe",
		"background: #0b1b3a; color: #e8f0ff; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; font-size: 12vmin; font-weight: 300; letter-spacing: 0.1em;",
		"Breathe",
	);
}
