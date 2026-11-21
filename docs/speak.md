# Речь для демо-видео

Конкурс: Presage SmartSpectra SDK Challenge. **Дедлайн сдачи 2026-11-22**, то есть видео нужно записать сегодня или завтра утром.

## Что нужно видео по правилам

Со страницы конкурса: жюри проверяет использование SDK по публичному репозиторию **и по видео**, поэтому в видео должны быть
**видны интеграция и живые сигналы Presage в работе** (выражения, пульс, дыхание). Нельзя: диагностика и лечение,
медицинские решения, скрытое или несогласованное наблюдение. Критерии: использование технологии, удобство, оригинальность.
Две призовые категории, обе подходят проекту: **Most Creative or Delightful Use** (Бета, ветрячок, сердце) и
**Best Thoughtful Real-World Use** (согласие на камеру, данные, управление без рук).

Видео и речь на **английском** (на английском должен быть и пост, иначе нет приза). Длина на странице не указана,
целимся в **3 минуты** (около 430 слов речи со скоростью 140–150 слов в минуту). Ниже полная версия и короткая на 60 секунд.

## Перед записью: что проверить на живой камере

В тексте стоят пометки **[ПРОВЕРИТЬ]**: эти куски опираются на то, что я не мог проверить без камеры. Запишите пробный
дубль и оставьте в видео только то, что реально работает.

- Пульс и дыхание (`@signals pulse`, `@signals breathing`): появляются ли значения, как быстро, не прыгают ли. Если
  пульс или дыхание не приходят стабильно, вырежьте сцену 4 целиком и оставьте запасную фразу из неё.
- Моргание (`blink`) не показывайте: оно не проверялось на реальных морганиях.
- Эмоции и жесты (улыбка, кивок, наклон) проверьте на ваших условиях света, как в справке «Use your camera».
- Включите **Show logs**, если хотите показать сырые строки Spectra в консоли: видно, что сигналы настоящие.
- Перед записью уберите из кадра API-ключ (`.env`) и закройте лишние вкладки.

## Полная версия, 3 минуты

Слева время и что на экране, ниже текст, который говорится вслух.

### 0:00–0:20 Крючок

**Экран:** чёрная заставка с названием «Pleiades Spectra», затем Бета с улыбкой в углу страницы.

> What if your face were a remote control for the web?
> Use your face reactions like a trigger . Any page, any site, controlled with a nod, a smile, a tilt of the head.
> I built with Claude Pleiades Spectra for this challenge: a browser extension and a small local server that runs the Presage SmartSpectra SDK.

### 0:20–0:45 Как это устроено

**Экран:** схема из трёх блоков: расширение → localhost-сервер с SDK → плагин на странице. Мелкий кадр кода `lib/spectra-sdk.ts`.

> There is no browser version of the SmartSpectra SDK, so I built a bridge.
> The extension reads camera frames and sends them over a WebSocket to a local server on your own machine.
> The server runs the SDK, and sends back expressions, head movements and measurements.
> A script on the page decides what to do with them.

### 0:45–1:20 Сцена 1: оценка улыбкой (живые выражения)

**Экран:** демо-блог, кнопка «Rate us», открывается окно оценки. Появляется Бета с вопросом «How was our service?», кнопки с жестами. Крупно лицо в углу, Бета меняет эмоции вслед за выражением лица. Пользователь улыбается, ответ принят, форма отправлена.

> Here is a rating dialog on an ordinary site. A script notices that it opened, turns the camera on, and asks a question.
> I answer with a smile. Or a nod, or a shake of the head. The mouse works too, always.
> Watch Beta, our mascot. Her face follows the expression that SmartSpectra reports, live: happy, surprised, disgusted.
> And when I answer, the camera goes off.

### 1:20–1:50 Сцена 2: управление без рук и плагины от ИИ

**Экран:** страница с длинной статьёй, плагин прокрутки: наклон головы вниз прокручивает страницу. Затем окно «Connect to AI» и короткая запись: просьба агенту, окно установки плагина с кодом и сайтами.

> With a script installed, I move between links with a tilt of the head, like Tab and Shift+Tab, and a lean to the right shoulder opens the link. No hands.
> A lean to the left switches to scroll mode, where the same tilts scroll the page.
> And these scripts are tiny JavaScript files. You can ask your AI agent: write me a script for this site.
> The agent writes it and sends it to the extension. But it can never install it. You see the code, the sites, and what it can read from your face, and you press Install.

### 1:50–2:20 Сцена 3: сигналы тела **[ПРОВЕРИТЬ]**

**Экран:** чёрная страница «sleep screen»: Бета в углу с сердечком из пальцев, внутри бьётся сердце, рядом число bpm. Затем страница «breathe»: Бета дует на вертушку, рядом число вдохов в минуту.

> Scripts can also read live measurements.
> This script shows my pulse on a black sleep screen. The heart beats at the rate SmartSpectra measures from the camera.
> This one turns breathing into a pinwheel that Beta blows on.
> These are rough estimates from video. They are not a medical reading, and the scripts are written that way.

*Запасная фраза, если пульс или дыхание не получились:* «SmartSpectra also gives pulse and breathing rate; scripts can read them, and the heart and the pinwheel are built for that.» Показать только код и сцену из стенда расширения, не выдавая её за измерение с лица.

### 2:20–2:55 Согласие и данные

**Экран:** попап: красная точка и подпись, кнопка «Turn off camera» и подпись про паузу. На странице: Бета с красной точкой. Окно установки: чипы жестов и сигналов, фраза согласия про постоянную камеру, красная пометка про физиологические сигналы. Справка, сноска «About your data».

> The camera is off by default. It turns on only while a script asks a question, or while a page that a script you installed works on is open and in front. Installing such a script is your consent, and the install window says so. Beta stands in the corner with a red dot whenever the camera runs, and one click on the dot pauses it.
The SDK telemetry is off by default.
> A script gets only the gestures and measurements it declares, and the install window lists them before you agree.
> And this is not a medical tool. It does not diagnose or judge anyone's health.

### 2:55–3:10 Итог

**Экран:** Бета машет, ссылка на репозиторий, тег.

> That is Pleiades Spectra: your face as an input, with your consent, on any page.
> The code, the setup steps and the details are in my post. Thank you for watching. Hashtag presagechallenge.

## Короткая версия, 60 секунд

Если нужен ролик для соцсетей или вставка в начало поста.

> What if your face were a remote control for the web?
> I built Pleiades Spectra, a browser extension that uses the Presage SmartSpectra SDK.
> A script asks a question, I answer with a smile or a nod, and Beta, our mascot, shows the expression SmartSpectra sees, live.
> A tilt of the head moves between links, a lean to the shoulder opens one. Your AI agent writes the scripts, but only you can install them.
> The camera is off by default, a red dot shows when it runs, and the video never leaves your computer.
> No diagnosis, no hidden watching: just your face, with your consent. Hashtag presagechallenge.

## Что сказать честно, если спросят

- **SDK не в браузере.** Браузерного SDK нет, поэтому кадры идут на локальный сервер: это единственное место, где SmartSpectra видит видео.
- **Телеметрия.** Выключена по умолчанию (`SMARTSPECTRA_TELEMETRY`). SDK всё равно обращается к Presage, чтобы проверить API-ключ.
- **Плагины это код страницы.** Права `@signals` и `@gestures` честным плагинам не дают лишнего, но злонамеренный плагин можно обойти: ставьте только те, которым доверяете. Это записано в справке и в разделе Consent поста.
- **Пульс, дыхание, моргание.** Оценки по видео, не медицинские показания; моргание в этой версии не проверено на реальных морганиях.
- **Бета.** Картинка принадлежит автору, который не установлен; используется в проекте по решению автора проекта.

## Чек-лист кадров для жюри

- [ ] В кадре виден код интеграции SDK (`apps/server/src/lib/spectra-sdk.ts`: запрос метрик и колбэк `onMetrics`).
- [ ] Живое выражение лица меняет эмоцию Беты, не запись и не заготовка.
- [ ] Хотя бы один живой сигнал Presage на экране (выражения обязательно, пульс или дыхание, если они проверены).
- [ ] Показано включение и выключение камеры, красная точка.
- [ ] Показано окно установки плагина с заявленными жестами и сигналами.
- [ ] Прозвучало, что это не медицинский инструмент и что данные не сохраняются.
- [ ] Ссылка на репозиторий и тег `#presagechallenge` в конце.
