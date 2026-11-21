# Релиз расширения

## Workflow

- `.github/workflows/ci.yml` — на PR и на push в `main`; на теги не срабатывает и релиз не блокирует. Jobs: `lint` (biome только по изменённым файлам: от базы PR или от прошлого push; в корне ещё есть старые замечания), `check` (check-types, unit-тесты `packages/reactions`, `bun run build`, проверка `git diff --exit-code packages/reactions/reactions.d.ts` после сборки), `e2e` (Playwright).
- `.github/workflows/release.yml` — на тег `v*` и вручную; CI не вызывает: перед тегом убедитесь, что последний коммит `main` зелёный (`workflow_dispatch`, input `dry-run`, по умолчанию true). Jobs:
  1. `build` — проверка версии, `wxt zip` (Chrome), `wxt zip -b firefox`, архив исходников, artifacts `release-files`.
  2. `github-release` — только для тега: GitHub Release с zip, sources и `reactions.d.ts`.
  3. `publish` — `wxt submit` в CWS и AMO, `environment: production`. Для тега запускается всегда, из ручного запуска — только при `dry-run = false`.
- Ручной запуск с dry-run только собирает и кладёт файлы в artifacts: ни Release, ни публикации. Сам `wxt submit --dry-run` (проверка секретов) в workflow не вынесен, его запускают локально с `.env.submit`.

## Версия

Источник версии — `apps/wxt/package.json` (`version`), WXT берёт её в manifest. Шаг `Read version and match it with the tag` падает, если тег не равен `v<version>`. Публикация возможна только с тега.

Выпуск: поднять `version` → коммит → `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Секреты

Лежат в Settings → Environments → `production` (не в repo secrets), чтобы их видел только job `publish`. Имена взяты из документации WXT (`wxt submit init`).

Chrome Web Store:
- `CHROME_EXTENSION_ID` — ID из dashboard (появляется после первой ручной загрузки zip).
- `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` — Google Cloud Console: создать проект, включить Chrome Web Store API, OAuth consent screen, OAuth client (Desktop app).
- `CHROME_REFRESH_TOKEN` — получить через `bunx wxt submit init` (он проведёт по OAuth) или вручную по OAuth-flow со scope `https://www.googleapis.com/auth/chromewebstore`.

Firefox AMO:
- `FIREFOX_EXTENSION_ID` — id из `browser_specific_settings.gecko.id` в manifest или slug/GUID аддона на AMO.
- `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` — addons.mozilla.org → Developer Hub → Manage API Keys.

`bunx wxt submit init` в `apps/wxt` создаёт локальный `.env.submit`; не коммитить, значения переносить в секреты.

## Ручное подтверждение

В Settings → Environments → New environment `production` → Required reviewers (добавить себя). Тогда job `publish` встаёт на паузу до нажатия Review deployments. Без reviewers публикация идёт сразу после тега.

## Что уходит в Firefox как исходники

`--firefox-sources-zip` — `spectra-<версия>-sources.zip`, это `git archive HEAD` всего репозитория. Не sources-zip от `wxt zip -b firefox`: он собирается из `apps/wxt` и без `packages/*` (workspace-зависимости `@repo/*`) ревьюер расширение не соберёт. Закоммитить нужно всё, что нужно для сборки, включая `bun.lock`. Сборка для ревьюера: `bun install --frozen-lockfile && bun run --cwd packages/reactions build && bun run --cwd apps/wxt zip:firefox` (Bun 1.4.3, Node 24). Эту инструкцию вписать в поле Notes to reviewer на AMO.

## Не проверено (нет ключей и запуска на GitHub)

- Сами workflow не запускались, YAML проверен только парсером; actionlint не стоял.
- `wxt submit`: работа с реальными CWS/AMO ключами, имена файлов zip (используется glob `*-chrome.zip`/`*-firefox.zip` в `apps/wxt/.output`, при двух совпадениях шаг упадёт).
- Первая загрузка в оба стора и получение ID делается руками: API обновляет только существующий аддон.
- Сработает ли `bun run e2e` на раннере (Chrome с `--enable-unsafe-extension-debugging`, `chrome://extensions` и «Allow User Scripts»).
- Хватит ли `AGENT_SERVER_ORIGIN`/`<all_urls>` разрешений для прохождения ревью в сторах — вопрос политик, не CI.
