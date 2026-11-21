# syntax=docker/dockerfile:1
# The context is the root of the repository: `docker compose up --build` (compose.yml) or
# `docker build -f apps/server/Dockerfile .`

FROM oven/bun:1.4.3 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/server build

FROM oven/bun:1.4.3
WORKDIR /app
COPY --from=build /repo/apps/server/dist ./

# The SmartSpectra SDK is installed here and not bundled: it loads a native library. It lists the libraries of every
# platform as dependencies, so the ones for other systems are deleted again in the same layer.
RUN BUN_INSTALL_CACHE_DIR=/tmp/bun-cache bun install --production \
	&& rm -rf /tmp/bun-cache \
	&& cd node_modules/@smartspectra \
	&& rm -rf node-sdk-darwin-* node-sdk-win32-* \
	&& if [ "$(uname -m)" = "x86_64" ]; then rm -rf node-sdk-linux-arm64; else rm -rf node-sdk-linux-x64; fi

# The expression model of the SDK runs on Vulkan, and a container has no graphics driver: without one the session fails
# with "Vulkan is not available". `mesa-vulkan-drivers` brings lavapipe, a Vulkan that runs on the processor. To use
# the graphics card of the machine instead, pass `/dev/dri` to the container (`devices:` in compose.yml).
RUN apt-get update \
	&& apt-get install -y --no-install-recommends mesa-vulkan-drivers \
	&& rm -rf /var/lib/apt/lists/*

# Inside the container the server listens on every address, or the published port could not reach it. The port is
# published on the loopback of the host only (compose.yml), so the server is still reachable from this machine alone.
ENV MODE=production HOST=0.0.0.0 PORT=3001
EXPOSE 3001
USER bun
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["bun", "index.js"]
