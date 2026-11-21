# Releasing the extension

## Workflow

- `.github/workflows/ci.yml` runs on PRs and on a push to `main`; it does not run on tags and does not block a release.
  Jobs: `lint` (biome only over the changed files: from the PR base or from the previous push; the root still has old
  findings), `check` (check-types, the unit tests of `packages/reactions`, `bun run build`, and a check of
  `git diff --exit-code packages/reactions/reactions.d.ts` after the build). E2E tests are not part of CI: run `bun run e2e` locally.
- `.github/workflows/release.yml` runs on a `v*` tag and by hand; it does not call CI: before tagging, make sure the
  last commit of `main` is green (`workflow_dispatch`, input `dry-run`, true by default). Jobs:
  1. `build` — a version check, `wxt zip` (Chrome), `wxt zip -b firefox`, a source archive, the artifacts
     `release-files`.
  2. `github-release` — for a tag only: a GitHub Release with the zips, the sources and `reactions.d.ts`.
  3. `publish` — `wxt submit` to the CWS and AMO, `environment: production`. For a tag it always runs; from a manual
     run only when `dry-run = false`.
- A manual run with dry-run only builds and puts the files into artifacts: no Release, no publishing. `wxt submit
  --dry-run` itself (a check of the secrets) is not moved into the workflow; it is run locally with `.env.submit`.

## The version

The source of the version is `apps/wxt/package.json` (`version`); WXT takes it into the manifest. The step
`Read version and match it with the tag` fails if the tag is not `v<version>`. Publishing is possible only from a tag.

To release: raise `version` → commit → `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Secrets

They live in Settings → Environments → `production` (not in repo secrets), so that only the `publish` job sees them. The
names are taken from the WXT documentation (`wxt submit init`).

Chrome Web Store:
- `CHROME_EXTENSION_ID` — the ID from the dashboard (it appears after the first manual upload of the zip).
- `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` — Google Cloud Console: create a project, enable the Chrome Web Store API,
  the OAuth consent screen, an OAuth client (Desktop app).
- `CHROME_REFRESH_TOKEN` — get it with `bunx wxt submit init` (it walks you through OAuth) or by hand through the OAuth
  flow with the scope `https://www.googleapis.com/auth/chromewebstore`.

Firefox AMO:
- `FIREFOX_EXTENSION_ID` — the id from `browser_specific_settings.gecko.id` in the manifest, or the slug/GUID of the
  add-on on AMO.
- `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` — addons.mozilla.org → Developer Hub → Manage API Keys.

While any of these secrets is empty, the `publish` job skips `wxt submit` with a warning instead of failing, so a tag
still gives a GitHub Release with the zips. Fill all seven to publish to the stores.

`bunx wxt submit init` in `apps/wxt` creates a local `.env.submit`; do not commit it, move the values into the secrets.

## Manual approval

In Settings → Environments → New environment `production` → Required reviewers (add yourself). Then the `publish` job
pauses until you press Review deployments. Without reviewers, publishing starts right after the tag.

## What goes to Firefox as the sources

`--firefox-sources-zip` is `spectra-<version>-sources.zip`, which is `git archive HEAD` of the whole repository. It is
not the sources zip from `wxt zip -b firefox`: that one is built from `apps/wxt` and without `packages/*` (the
workspace dependencies `@repo/*`), so a reviewer cannot build the extension from it. Everything needed for the build
must be committed, including `bun.lock`. The build for the reviewer: `bun install --frozen-lockfile && bun run --cwd
packages/reactions build && bun run --cwd apps/wxt zip:firefox` (Bun 1.4.3, Node 24). Put this instruction into the
Notes to reviewer field on AMO.

## Not checked (no keys and no run on GitHub)

- The workflows themselves have not been run; the YAML was checked only by a parser, and actionlint was not installed.
- `wxt submit`: work with real CWS/AMO keys, and the zip file names (the glob `*-chrome.zip`/`*-firefox.zip` in
  `apps/wxt/.output` is used; with two matches the step fails).
- The first upload to both stores and getting the ID is done by hand: the API only updates an existing add-on.
- Whether the `AGENT_SERVER_ORIGIN`/`<all_urls>` permissions are enough to pass review in the stores — a question of
  policies, not of CI.
