# Коннектор для ИИ-агента

Редакция от 2026-11-20. Делаем как у SheetCanvas (`github.com/tektrg/sheetcanvas`, разобраны `backend/src/mcp/route.ts`,
`backend/src/mcp/bridge.ts`, `src/agent/useMcpBridge.ts`, `src/components/ConnectAgentDialog.tsx`).
Контракт в коде: `packages/protocol/src/agent-link.ts`.

## Как это устроено у SheetCanvas

1. UI создаёт **секретный токен** (24 байта, 48 hex) и показывает URL `https://…/mcp/<токен>`. Токен — пароль:
   «anyone with this URL can read and modify this canvas». Есть «Regenerate URL (revokes the current one)».
2. Пока включён чекбокс **«Expose to agents»**, вкладка браузера держит один **WebSocket** к бэкенду. Соединение =
   «открыто для агентов», закрытие = «закрыто». **Живое состояние принадлежит вкладке**, бэкенд только ретранслирует.
3. Агент (Claude Code, Codex) ходит на `POST /mcp/<токен>` (MCP, JSON-RPC по HTTP, без SSE и без batch).
   `tools/call` бэкенд валидирует по общей схеме (zod) и пересылает во вкладку как `{ id, name, input }`;
   вкладка выполняет и отвечает `{ id, ok, result | error }`.
4. Детали моста: один сокет на токен (новая вкладка вытесняет старую кодом закрытия 4000, старая **не**
   переподключается); вызовы выполняются по очереди; таймаут вызова 30 с; при обрыве сокета все ожидающие вызовы
   падают с понятной ошибкой; heartbeat `ping`/`pong` каждые 20 с (нет pong 10 с → закрыть и переподключиться);
   переподключение с экспоненциальной паузой 1 → 30 с.
5. Если вкладки нет, инструмент возвращает ошибку «Canvas not connected. Open your tab and enable “Expose to agents”».
   Эту же подсказку агенту даёт поле `instructions` в ответе `initialize`. Для записи: «если запись упала по таймауту,
   сначала прочитай, потом повторяй».
6. Диалог «Connect Claude or Codex»: кнопка «Generate agent connection URL», статус-точка (connected / connecting /
   disconnected / replaced), чекбокс «Expose to agents», поля копирования «Agent server URL» и
   `claude mcp add sheetcanvas --transport http <url>`, ссылка на инструкцию.
7. Описания инструментов лежат в одном месте и используются и бэкендом (`tools/list`, валидация), и вкладкой
   (отказ на неизвестное имя); у каждого есть `readOnlyHint` / `destructiveHint`.

## Что делаем у себя

| SheetCanvas                                   | Pleiades Spectra                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Бэкенд на Cloudflare, Durable Object на токен | `apps/server` (Bun, Elysia), один мост в памяти на токен                                         |
| Вкладка холста держит WebSocket               | **Страница плагинов расширения** (вкладка, не service worker: он засыпает)                       |
| `POST /mcp/<токен>`                           | `POST http://localhost:3001/mcp/<токен>`                                                         |
| WS `/api/mcp/bridge/<токен>`                  | WS `ws://localhost:3001/agent/<токен>`                                                           |
| Токен выдаёт сервер                           | Токен создаёт расширение (`crypto.getRandomValues`, 24 байта → 48 hex), хранит в `storage.local` |
| Холст, таблицы, графики                       | Установленные плагины                                                                            |

### Инструменты

| Инструмент                    | Где выполняется   | Что делает                                                                                                                                                                                             |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_script_guide`            | сервер            | правила, `reactions.d.ts` и примеры из `@repo/reactions`, чтобы агент знал, как писать плагин                                                                                                          |
| `validate_script({ source })` | сервер            | разбор заголовка `parseHeader`, код **не выполняется**                                                                                                                                                 |
| `list_scripts`                | страница плагинов | `PluginSummary[]`: id, включён ли, заголовок                                                                                                                                                           |
| `get_script({ id })`          | страница плагинов | полный код установленного плагина (чтобы доработать)                                                                                                                                                   |
| `propose_script({ source })`  | страница плагинов | сервер проверяет заголовок; страница открывает **обычное окно установки** с пометкой «Proposed by an AI agent»; инструмент отвечает после решения: `installed` / `declined`, или `pending` через 120 с |

Агент **никогда не ставит плагин сам**, не включает, не выключает и не удаляет. Плагин исполняет код на страницах сайтов,
поэтому решение за пользователем (окно показывает код, сайты и режим камеры). Описания инструментов и схемы входа
(zod) лежат в одном модуле `packages/protocol`, его используют сервер и расширение.

### Мост (как у SheetCanvas)

- Сервер → страница: `{ id, name, input }` (тип `BridgeRequest`). Страница → сервер: `{ id, ok: true, result }` или
  `{ id, ok: false, error }` (`BridgeResponse`). Текстовые `ping` / `pong` для heartbeat.
- Один сокет на токен, новый вытесняет старый кодом `4000` (`BRIDGE_CLOSE_REPLACED`), вытесненная страница не
  переподключается. Вызовы по очереди. Таймаут 30 с (`BRIDGE_REQUEST_TIMEOUT_MS`), `propose_script` ждёт до 120 с
  (`PROPOSAL_WAIT_MS`). Обрыв сокета → ожидающие вызовы получают ошибку.
- Подключение к `/agent/<токен>` = «Expose to agents» включено. Закрытие = выключено.
- Сервер принимает любой валидный токен с сокета расширения (локальный пользователь один). `/mcp/<токен>`
  отвечает только на токены, с которыми страница уже подключалась: неизвестный токен → 404 без подсказок, сравнение за
  постоянное время. Если тумблер выключен, URL остаётся известным: инструменты, которым нужна страница, возвращают
  подсказку «включите Expose to agents». «Regenerate» закрывает сокет кодом 4001 (`BRIDGE_CLOSE_REVOKED`), и сервер
  забывает старый токен (если в этот момент тумблер был выключен, старый токен живёт до перезапуска сервера:
  отдать данные он не может, страницы нет).
- Нет страницы на связи → инструмент возвращает `isError`: «Open the Scripts page in the extension and turn on
  “Expose to agents”». То же в `instructions` ответа `initialize`.

### MCP-эндпоинт

`POST /mcp/<токен>`, stateless Streamable HTTP через `@modelcontextprotocol/sdk` (уже в зависимостях сервера).
`GET` и `DELETE` отвечают 405. Протокол и формат ответов как у SheetCanvas: один JSON-RPC запрос за раз.

### Безопасность

- **Токен = пароль.** Показываем один раз в диалоге с предупреждением; «Regenerate» отзывает старый.
- Localhost-сервер виден любому сайту, поэтому: `/mcp/*` отклоняет (403) любой запрос с браузерным `Origin`
  (MCP-клиенты `Origin` не шлют); WS `/agent/*` принимает только `chrome-extension://` и `moz-extension://`
  (браузер не даёт странице подделать `Origin` у WebSocket); `Host` только loopback (защита от DNS rebinding);
  сервер слушает `127.0.0.1`.
- Содержимое плагинов не логируется. Размер `source` ≤ 64 КБ.
- Агент не видит ни видео, ни точки лица, ни выражения: коннектор работает только с плагинами. Для раздела
  Consent and Data Handling: подключение агента — отдельное явное действие (генерация URL + тумблер), установка
  каждого плагина — отдельное подтверждение.

## Интерфейс (страница плагинов)

Кнопка **«Connect AI agent»** в заголовке страницы (рядом с «How to create script») открывает диалог:

1. Пока токена нет: кнопка «Generate agent connection URL».
2. Статус-точка: `connected` (страница держит сокет) / `connecting` / `disconnected` / `replaced`
   («Another Scripts tab took over — toggle off and on here to reclaim»), чекбокс/тумблер «Expose to agents».
3. Поля с кнопкой Copy: «Agent server URL» (`http://localhost:3001/mcp/<токен>`) и
   «Add to Claude Code» (`claude mcp add --transport http pleiades <url>`).
4. «Regenerate URL (revokes the current one)».
5. Предупреждение: «Anyone with this URL can ask your extension to propose scripts while the toggle is on. Treat it
   like a password. Scripts are never installed without your confirmation. Keep this page open while your agent works.»

Пока диалог закрыт, но тумблер включён, страница плагинов продолжает держать сокет (как вкладка SheetCanvas).
Предложение агента открывает то же окно установки: пометка «Proposed by an AI agent», кнопки Install / Cancel;
решение возвращается агенту как результат `propose_script`.

Раздел «Let an AI agent do it for you» в модалке «How to create script» ведёт на этот диалог (кнопка «Connect AI agent»)
и больше не содержит статический адрес.

## Что убрать из уже сделанного

Реализация первой итерации (очередь предложений + опрос) заменяется, чтобы не было двух механизмов:

- `apps/server`: очередь предложений, `GET/DELETE /agent/proposals`, preflight для них, `PluginProposal` в
  `proposals.ts`. Остаются и переиспользуются `check-plugin.ts`, `plugin-guide.ts`, `request-guard.ts`, `get_script_guide`,
  `validate_script`, привязка к `127.0.0.1`, скрипт `mcp-check.ts` (переписать под токен и мост).
- `apps/wxt`: `lib/agent/proposals.ts`, `merge-proposals.ts`, `proposal-watcher.ts`, бейдж на иконке, `alarms`,
  `agent/resume-polling`, строка в popup, статический адрес в модалке. Разрешение `http://localhost:3001/*` остаётся
  (мост и проверка сервера).

## Порядок работ

1. Сервер: токены в пути, мост `/agent/<токен>` (регистрация, очередь вызовов, таймауты, вытеснение, heartbeat),
   MCP `/mcp/<токен>`, пять инструментов, общий модуль схем, защита, `mcp-check.ts`, тесты на бизнес-логику.
2. Расширение: клиент моста на странице плагинов (токен, тумблер, переподключение, heartbeat, обработка трёх
   инструментов), диалог «Connect AI agent», `propose_script` через окно установки, удаление первой итерации, тесты.
3. Сквозная проверка с реальным клиентом (Claude Code) вручную: добавить URL, попросить написать плагин, увидеть окно
   установки. Автоматические тесты проверяют только логику и сервер с фальшивым мостом.
