# syntax=docker/dockerfile:1
# The context is the root of the repository: `docker compose up --build` (compose.yml) or
# `docker build -f apps/demo/Dockerfile .`

FROM oven/bun:1.4.3 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/demo build

FROM oven/bun:1.4.3
WORKDIR /app
COPY --from=build /repo/apps/demo/dist ./

ENV DEMO_HOST=0.0.0.0 DEMO_PORT=4010
EXPOSE 4010
USER bun
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
	CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.DEMO_PORT}/`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["bun", "index.js"]
