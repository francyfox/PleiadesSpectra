# SmartSpectra: что внутри, есть ли открытые аналоги (исследование 2026-11-24)

Пометки: **[док]** = из документации/публикации/файла (источник указан); **[вывод]** = мой вывод или догадка.
Чего нет в источниках, так и написано «не найдено».

## Оглавление

1. [Какие модели и алгоритмы в SmartSpectra](#1-какие-модели-и-алгоритмы-в-smartspectra)
2. [Можно ли запустить модель без SDK, лицензия, онлайн](#2-можно-ли-запустить-модель-без-sdk)
3. [Что даёт SDK сверх голой модели](#3-что-даёт-sdk-сверх-голой-модели)
4. [Открытые аналоги (таблица)](#4-открытые-аналоги)
5. [Практический вывод и рекомендация](#5-практический-вывод-и-рекомендация)

---

## 1. Какие модели и алгоритмы в SmartSpectra

### Общее

- **[док]** Pulse, HRV, relative arterial pressure: «proprietary computer vision and signal processing pipeline», извлекает PPG из видео. Архитектура, обучающие данные и размер модели не раскрыты. Модельные карточки пишут только «developed on videos with various lighting and motion conditions». Источники: https://vandv.presagetech.com/arterial_pressure_model_card.html, https://vandv.presagetech.com/hrv_model_card.html, https://vandv.presagetech.com/breathing_model_card.html (версия модели d205a6f0, дата 2026-11-06).
- **[док]** Принцип: «small color shifts in skin caused by blood volume pulse» (пульс) и микродвижения груди/живота (дыхание). https://smartspectra.presagetech.com/docs/measurement-quality.md. В FDA-досье: «Pulse is determined based on subtle changes in skin coloration associated with blood flow. Respiration is determined based on movements of the subject's upper torso» (https://www.accessdata.fda.gov/cdrh_docs/pdf25/K254169.pdf).
- **[вывод]** Это rPPG по цвету кожи, нейросеть это или классическая обработка, из источников не ясно. Слово «proprietary» не отвечает на этот вопрос.
- Научных публикаций Presage по архитектуре, патентов и блога с описанием модели **не найдено** (поиск по вебу, arXiv, патентам). Нашлись только клиническая статья и FDA-досье (ниже). Утверждать, что патентов нет, нельзя: поиск был неглубоким.

### (а) Пульс

| Параметр | Значение | Источник |
|---|---|---|
| Окно пульса | 12 с (докс), 10.6 с (модельная карточка, окно сравнения с ЭКГ), 30 с окно в FDA-таблице | **[док]** model-cards-and-limitations.md; arterial_pressure_model_card; K254169 стр. 6 |
| Диапазон | 40–110 уд/мин (докс), 40–180 (модельная карточка), 50–150 (FDA) | **[док]**, три источника расходятся |
| Точность | MAE 0.37, RMSE 0.69 уд/мин при confidence ≥ 97 и 80% return rate (118 человек, 413 видео, эталон Biopac MP160 ЭКГ) | **[док]** arterial_pressure_model_card |
| FDA | RMSE пульса 1.34-1.81 уд/мин по подгруппам; порог приёмки 3 уд/мин | **[док]** K254169 стр. 8 |
| Клиника | пульс r=0.990, RMSE 1.62, смещение +0.52 уд/мин, 111 добровольцев, захват 83% (278 из 333); устройства Galaxy S24, iPhone 16 Pro, Logitech C920e | **[док]** https://www.frontiersin.org/journals/medical-technology/articles/10.3389/fmedt.2025.1728913/full |
| Условия | неподвижность, лицо и **верхняя часть груди** видны, 25+ fps, заблокированные экспозиция/gain/баланс белого, нет жвачки/мерцания | **[док]** модельные карточки |
| Расстояние при валидации | в среднем 26 дюймов (~66 см) для веб-камер и штатива, 10 дюймов (~25 см) для фронтальной камеры S24 в руках | **[док]** arterial_pressure_model_card |
| Кожа | Фицпатрик 1-6 (21/12/13/24/33/15 человек); «может влиять», разбивки ошибки по типам кожи нет | **[док]** там же |

Расхождения в окне/диапазоне между страницами документации сами по себе вывод: документация не вычитана до единого значения.

### (б) Детекция лица и ландмарки (478 точек)

- **[док]** 478 landmarks как x/y в пикселях; ссылка на нумерацию MediaPipe (https://smartspectra.presagetech.com/docs/model-cards-and-limitations.md). NOTICE нативного пакета перечисляет MediaPipe, LiteRT (TFLite runtime), TensorFlow, OpenCV (файл NOTICE в `@smartspectra/node-sdk@3.5.0`).
- **[док, факт из списка файлов]** В нативном пакете `@smartspectra/node-sdk-linux-x64@3.5.0` лежат: `face_detection_short_range.tflite` (229 746 байт), `face_detection_full_range.tflite`, `face_landmark.tflite`, `face_landmark_with_attention.tflite` (2.5 МБ), `pose_detection.tflite`, `pose_landmark_lite.tflite`, `pose_landmark_full.tflite`, плюс граф `metrics_cpu_continuous_rest.binarypb`.
- **[вывод]** Это стандартные модели MediaPipe: `face_detection_short_range.tflite` совпадает по размеру до байта (229 746) с `blaze_face_short_range.tflite` из открытого демо ME-rPPG (https://github.com/Health-HCI-Group/ME-rPPG-demo). Содержимое я не сравнивал, только размер. Значит, детекция лица и 478 точек у SmartSpectra, скорее всего, MediaPipe Face Mesh with attention (с радужкой), а не своя разработка.
- **[вывод]** Наличие `pose_*` моделей объясняет «chest visible» в валидации: вероятно, грудь определяется по позе (плечи/торс). Проверить нельзя без анализа бинарников, чего я не делал.

### (в) Выражения лица (8 классов), моргание, речь

- **[док]** Выражения: 8 классов с вероятностями (anger, contempt, disgust, fear, happiness, sadness, surprise, neutral); моргание и речь бинарные (model-cards-and-limitations.md).
- Модель выражений, архитектура, обучающая выборка: **не найдено** ни в доках, ни в списке файлов. Отдельного `.tflite` под выражения в пакете нет; значит, либо внутри `libsmartspectra.so` (48 МБ), либо вычисляется иначе. Бинарник я не разбирал.
- **[вывод]** Набор из 8 классов (с contempt) совпадает со стандартной разметкой AffectNet-8, на которой обучены открытые EmotiEffLib/HSEmotion (ниже). Это совпадение набора классов, а не доказательство того же датасета.
- Ограничение **[док]**: лицо должно быть примерно фронтально к камере.

### (г) Проверки кадра (validation)

- **[док]** Коды: NO_FACE_FOUND, MULTIPLE_FACES_FOUND, FACE_NOT_CENTERED, TOO_DARK, TOO_BRIGHT, **CHEST_NOT_VISIBLE** («Chest not visible or too far away (breathing/chest metrics)»), CAMERA_TUNING, FRAME_RATE_TOO_LOW, EXCESSIVE_MOTION, FACE_TOO_CLOSE, FACE_TOO_FAR, FACE_TOO_HIGH, FACE_TOO_LOW, FACE_NOT_FORWARD (https://smartspectra.presagetech.com/docs/measurement-quality.md). Пороги в источниках не опубликованы.
- **[док]** По документации CHEST_NOT_VISIBLE относится к метрикам дыхания/груди. Ваше наблюдение (пульс блокируется при лице >35-40% высоты кадра с этой подсказкой) в документации не описано и расходится с её текстом: там для пульса нужны «face and upper chest visible».

### Лицензия, репозиторий, релизы

- **[док]** Репозиторий: https://github.com/Presage-Security/SmartSpectra (организация Presage-Security, а не Presage-Github). Каталоги android, swift, cpp, nodejs, windows (.NET), docs. Это обёртки/примеры/документация, весов в дереве репозитория нет (проверил дерево через API: нет `.tflite/.onnx/.so/.pb` и файлов больше 2 МБ).
- **[док]** Лицензия: «proprietary ... solely under Presage's Terms of Service» (https://raw.githubusercontent.com/Presage-Security/SmartSpectra/main/LICENSE). Текст ToS (https://physiology.presagetech.com/tos) это одностраничное JS-приложение, прочитать его мне не удалось. Что именно ToS запрещает (реверс-инжиниринг, извлечение моделей), **не проверено**.
- **[док]** FDA: SmartSpectra Vital Signs Monitor 1.0, 510(k) K254169, 18 июня 2026, предикат Oxehealth K211906 (https://www.accessdata.fda.gov/cdrh_docs/pdf25/K254169.pdf). Но SDK-метрики для разработчиков: «have not been cleared by the FDA», только общее wellness. Показания FDA: статичная установка смартфона, обученный персонал, 18–70 лет. Это не относится к нашему применению.

---

## 2. Можно ли запустить модель без SDK

Что я проверил (только список файлов и размеры, ничего не запускал и не извлекал; всё скачано в отдельные папки scratchpad):

- `@smartspectra/node-sdk@3.5.0` (tarball 134 КБ, 30 файлов): только JS-обвязка (koffi FFI), `.d.ts`, лицензии (LGPL FFmpeg), README. **Весов и нативных библиотек нет.** package.json: `"license": "SEE LICENSE IN LICENSE"`. **[док/факт]**
- Нативная часть едет отдельным зависимым пакетом `@smartspectra/node-sdk-linux-x64@3.5.0` (tarball 45.7 МБ, распаковано 98 МБ, 52 файла). README пакета: «Internal package, do not install directly». Состав: `libsmartspectra.so` (48.3 МБ), `libsmartspectra_capi.so` (3.8 МБ), FFmpeg/GL/Vulkan и системные `.so`, 7 файлов `.tflite` (список в п. 1б), `graph/metrics_cpu_continuous_rest.binarypb` (5 КБ), `smartspectra_manifest.json`. **[факт по списку файлов]**
- **[факт]** Модели лица и позы лежат в открытом виде как `.tflite`. Модели, дающей пульс, отдельным файлом **нет**; вероятно, она вшита в `libsmartspectra.so` (**[вывод]**, не проверял, разбирать бинарник не стал).
- **[вывод]** Лицензия проприетарная и «solely under ToS». Использовать их `.tflite` или вшитые веса вне SDK нельзя считать разрешённым, пока не прочитан ToS. Сами MediaPipe-модели при этом публичны под Apache-2.0 от Google (**[док]**: Apache перечислен в NOTICE как лицензия компонентов; для отдельных файлов лицензию нужно брать у MediaPipe, а не у копии из пакета). Практически: если нужен Face Mesh, берите официальный MediaPipe, а не копию из пакета Presage.
- **Онлайн.** **[док]** «No offline mode»: измерение аутентифицируется на сервисе, нужен интернет (https://smartspectra.presagetech.com/docs/nodejs, раздел Limitations; страница CI в full.txt). Для Node SDK и подписки «An internet connection is required for subscription validation». Утверждение «вычисления локальные» подтверждается косвенно: метрики называются «on-device» (measurement-quality, llms-full), телеметрия «does not attach raw video/image frames or measured physiological values» (https://smartspectra.presagetech.com/docs/telemetry-and-privacy.md). Прямого утверждения вида «видео никогда не покидает устройство» я не нашёл. **[вывод]** Сетевой трафик SDK не перехватывал, так что «только проверка ключа» подтверждено документацией, но не измерением.
- **[док]** Телеметрия включена по умолчанию; отключается `enableTelemetry: false`; отправляет сводки сессий и отчёты готовности устройства (может содержать пути в свободном тексте). Раздельно от этого LLM Insights, отдельный серверный сервис (в доках отдельная страница).

---

## 3. Что даёт SDK сверх голой модели

Всё **[док]**, если не помечено иначе (https://smartspectra.presagetech.com/llms.txt, llms-full.txt):

- **Конвейер кадров**: `useCustomInput()` → `start()` → `sendFrame(buffer, w, h, stride, pixelFormat, tsUs)`; форматы `kRGB/kBGR/kRGBA/kBGRA`; нужны ≥25 к/с (рекомендуют 30). Также `useFile()`, `useCamera()`, в Electron `useMediaStream()`.
- **Окна и прогрев**: confidence = 0 пока окно не заполнено: пульс 12 с, дыхание 30 с, HRV 60 с, EDA первый результат около 35 с.
- **confidence и stable**: каждое значение с `confidence` (0–100) и `stable` (пульс ≥40 = ±3 уд/мин, дыхание ≥45 = ±1 вдох/мин, HRV ≥50 = ±5 мс). Это то, что превращает сырой сигнал в «можно показывать».
- **Валидация и подсказки**: 14 кодов со встроенным текстом `hint`.
- **Метрики**: `cardio` (пульс, относительная кривая давления, HRV: Mean NN, RMSSD, SDNN, Baevsky), `breathing` (rate + upper/lower trace), `face` (landmarks, blinking, talking, expression), `eda` (EDA Proxy), `micromotion` (GLUTES_MICROMOTION, KNEES_MICROMOTION, в Node бандл `micromotionMetrics`). Недоступно: амплитуда дыхания, апноэ и т.п. (`start()` падает).
- **Платформы**: C++ (Linux/macOS/Windows), Swift, Kotlin, Node/Electron (glibc 2.35+), .NET (экспериментально).
- **Ключ/подписка/лимиты**: API-ключ или OAuth (мобильные), `CREDIT_EXHAUSTED`/`kCreditExhausted` при исчерпании квоты; цен и лимитов по метрикам в документации нет.
- **Управление камерой** (`useCamera`): **[ваши измерения, не документация]** переводит камеру в ручную экспозицию и оставляет тёмной. Модельная карточка при этом требует заблокированных экспозиции/gain/WB **[док]**.
- **Телеметрия**: см. п. 2.
- **[вывод]** Главная ценность harness: готовая калибровка confidence к ошибке (карточки с «confidence-to-error mapping»), валидация кадра и единая схема метрик. Голая rPPG-модель этого не даёт: придётся самому делать SQI и пороги.

---

## 4. Открытые аналоги

Скорость и размер даны из источников; «CPU realtime» без измерения помечено как [вывод]. Точность на разных датасетах несравнима между строками (разные протоколы, условия съёмки).

| Название / ссылка | Тип | Размер / скорость | Лицензия | Данные обучения | Заявленная точность (MAE, уд/мин) | Требования к кадру | Браузер |
|---|---|---|---|---|---|---|---|
| **ME-rPPG** https://github.com/KegangWangCCNU/ME-rPPG , демо https://github.com/Health-HCI-Group/ME-rPPG-demo , arXiv 2504.01774 | нейросеть, state-space, потоковая | 3.6 МБ памяти, 9.46 мс/шаг (arXiv, аппаратура не указана); `model.onnx` 2.49 МБ + `state.json` 7.2 МБ | код MIT (ME-rPPG), демо Apache-2.0; веса: см. примечание ниже | RLAP (по README, обучение через PhysBench) | кросс-датасет: PURE 0.25, VitalVideo 0.70, MMPD 5.38 (единицы не указаны в аннотации, вероятно bpm) | вход 36×36×3 кроп лица (README), детектор BlazeFace short range | **Да**, ONNX Runtime Web, нужны COOP/COEP заголовки для SIMD |
| **open-rppg** https://github.com/KegangWangCCNU/open-rppg , PyPI `open-rppg` | обёртка: ME-chunk/ME-flow, PhysMamba, RhythmMamba, PhysFormer, TS-CAN, EfficientPhys, PhysNet, FacePhys | веса 1.1–15.7 МБ (.h5), BlazeFace ONNX 0.4/2.1 МБ; JAX/Keras/ONNX Runtime | код MIT; веса «по лицензиям исходных статей» | RLAP или PURE (суффиксы `.rlap`/`.pure`) | по статьям моделей | перед моделью свой детектор лица, режим `Near` (selfie) и `Far`; кадр 640×480 допустим; HR по 10 с окну; даёт SQI, HRV, дыхание | нет (Python), но модели ME конвертируются |
| **rPPG-Toolbox** https://github.com/ubicomplab/rPPG-Toolbox , arXiv 2210.00716 | набор: классика (POS, CHROM, ICA, GREEN, LGI, PBV) + DeepPhys, TS-CAN, PhysNet, PhysFormer, EfficientPhys, FactorizePhys, RhythmFormer | модели небольшие (PyTorch), не оптимизированы под браузер | Responsible AI Source Code License (RAIL, 1.1): с ограничениями на применение, читать до использования | UBFC-rPPG, PURE, SCAMPS (синтетика), MMPD, BP4D+, iBVP | см. ниже: на PURE→UBFC TS-CAN 1.29, PhysNet 0.98; на MMPD (телефон, движение, разный свет) 9.5–23 | кроп лица (Haar или YOLO5Face) | нет |
| **POS / CHROM** (в rPPG-Toolbox, pyVHR, VitalLens клиентах) | классический алгоритм по среднему цвету кожи | микросекунды, любой CPU, без весов | зависит от реализации | не обучаются | в таблице Toolbox: POS 3.67 (PURE), 4.00 (UBFC), 12.36 (MMPD); CHROM 5.77 / 3.98 / 13.66 | нужен стабильный ROI кожи; плохо при движении и разном свете | **Да**, тривиально в JS |
| **pyVHR** https://github.com/phuselab/pyVHR | классика + DL, Python-фреймворк | CPU/GPU | GPL-3.0 | не применимо | не извлекал | лицо, MediaPipe ROI | нет |
| **heartbeat (prouast)** https://github.com/prouast/heartbeat | классика (десктоп) | CPU | GPL-3.0 | не применимо | не извлекал | лицо | нет |
| **VitalLens** клиенты https://github.com/Rouast-Labs/vitallens-python , vitallens.js (MIT) ; API https://www.rouast.com/api/ | клиент + **облачная модель**; локально только POS/CHROM/G | клиент шлёт кадры 40×40 px на сервер; бесплатно 20K кадров/мес, 5 запросов/с | клиенты MIT; сервер по ToS | не раскрыто | 422 человека: HR 1.57, RR 1.08 bpm/brpm, HRV-SDNN 10.18 мс (по сайту) | лицо в пределах 0.5 м, анфас, без компрессии | клиент работает в браузере, но сама модель на сервере |
| **HF `RabiatS/me-rppg-web`** https://huggingface.co/RabiatS/me-rppg-web | копия ME-rPPG под transformers.js/onnx | `model.onnx` + `state.json` | MIT (по карточке) | как ME-rPPG | как ME-rPPG | как ME-rPPG | **Да** |
| **HF `hyunseop/vision-cardio-rppg`**, `jakuzya/rppg-physnet`, `Bgeorge/Single_ROI_RPPG` | сообщества, малоизвестные (≤5 загрузок) | не изучал | MIT / Apache-2.0 | не изучал | не изучал | не изучал | не оценивал |
| **MediaPipe Face Landmarker** https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker | нейросеть: детектор 128×128, 478 точек 256×256, 52 blendshape | лёгкие float16 TFLite; размер бандла и латентность на странице не указаны | лицензия на странице не указана (MediaPipe: Apache-2.0, известно мне, не из этой страницы) | не раскрыто на странице | не применимо (landmarks) | `numFaces` по умолчанию 1; на выходе blendshapes (jawOpen, brow...), не эмоции | **Да**, `@mediapipe/tasks-vision` (WASM/GPU) |
| **EmotiEffLib / HSEmotion** https://github.com/sb-ai-lab/EmotiEffLib | нейросеть FER: EfficientNet-B0/B2, MobileNet; ONNX/PyTorch | B0: 16 МБ, ~59 мс на Snapdragon 888 CPU (README); B2: 30 МБ, 191 мс | код Apache-2.0; веса обучены на AffectNet, для которого условия академические (**[вывод]**, проверять) | AffectNet, AFEW, VGAF | AffectNet 8 классов: B0 60.95-61.93%, B2 63.0% accuracy (README) | кроп лица | ONNX Runtime Web возможно (**[вывод]**) |
| **HF `trpakov/vit-face-expression`** https://huggingface.co/trpakov/vit-face-expression | ViT-base, 7 классов | 85.8 млн параметров, ONNX есть, тяжёлая для маленьких моделей | Apache-2.0 | FER2013 | accuracy на валидации 0.7113 | кроп лица | возможно, но тяжёлая |
| **HF `onnx-community/face-emotion-detection-ONNX`** | ViT, квантованные ONNX (int8, q4, fp16) | квантования уменьшают размер | Apache-2.0 | FER2013 (по тегам) | не извлекал | кроп лица | **Да**, transformers.js |
| **ONNX Model Zoo `emotion-ferplus-8`** (HF `onnxmodelzoo/emotion-ferplus-8`) | малая CNN, 8 классов FER+ | малая, классический ONNX | Apache-2.0 | FER+ | не извлекал | 64×64 серый кроп | **Да** |

Примечание по ME-rPPG: у `RabiatS/me-rppg-web` лицензия MIT заявлена по карточке (копия весов «unchanged»), у `open-rppg` веса оговорены «по лицензиям исходных статей». Лицензию именно весов ME-rPPG нужно уточнить перед использованием в публичном репозитории.

Таблица MAE из rPPG-Toolbox (arXiv 2210.00716, Table 2, MAE в bpm): POS 3.67 (PURE) / 4.00 (UBFC-rPPG) / 4.51 (UBFC-Phys) / 12.36 (MMPD); CHROM 5.77 / 3.98 / 4.49 / 13.66; TS-CAN, обучен на PURE, тест UBFC: 1.29; PhysNet на PURE→UBFC: 0.98; на MMPD все методы дают 9.5–23.

### Что реально запустить

- **CPU realtime на ноутбуке [вывод, не измерял]**: ME-rPPG (авторы заявляют 9.46 мс на шаг), TS-CAN, EfficientPhys, POS/CHROM. Тяжёлые PhysFormer/RhythmMamba (11–16 МБ) возможны офлайн, но смысла для realtime мало.
- **Браузер**: ME-rPPG через ONNX Runtime Web (есть готовое демо с исходниками), POS/CHROM на JS, MediaPipe Face Landmarker, FER-модели в ONNX.
- **Из тех, что подходят «маленьким моделям» Pleiades**: ME-rPPG (2.5 МБ), FER+ (малая CNN), BlazeFace.

### Важная оговорка про точность

Заявленная точность аналогов получена на лабораторных датасетах (PURE, UBFC, RLAP, VitalVideo). На MMPD, где есть движение, разный свет и мобильные камеры, ошибки в Toolbox 9–23 bpm. Цифры типа 0.25 на PURE нельзя переносить на реальную веб-камеру ноутбука. У SmartSpectra подтверждение в условиях близких к реальным есть только для их собственной валидации (MAE 0.37 при confidence ≥ 97 и 80% return rate: это точность по отфильтрованным измерениям, а не по всем).

---

## 5. Практический вывод и рекомендация

### Что можно сказать про ограничение «chest not visible»

- **[док]** Для пульса, HRV и кривой давления документация требует «face and upper chest visible» и 25+ fps. Валидация заявляет FACE_TOO_CLOSE отдельно от CHEST_NOT_VISIBLE.
- **[вывод, догадка]** Наличие `pose_*.tflite` в пакете и сам код CHEST_NOT_VISIBLE указывают, что SDK ищет торс, и при крупном лице торса в кадре нет. Уменьшение кадра с чёрными полями возвращает торс в кадр или хотя бы уменьшает лицо ниже порога. Ваши эксперименты согласуются с этим, но порог 35–40% высоты в документации нигде не указан.
- **[вывод]** Модельная карточка требует расстояние 26 дюймов (≈66 см) для веб-камер, 10 дюймов только для S24 в руках. То есть крупное лицо ноутбучной веб-камеры на 40 см вне зоны, на которой SmartSpectra валидирована. Точность пульса при обходе чёрными полями на лице малого размера (~100–150 px по высоте на 640×480) нужно сверять с эталоном, документация этого не гарантирует.

### Какие аналоги считают пульс вблизи без таких ограничений

- Все открытые нейросети (ME-rPPG, TS-CAN, PhysNet, EfficientPhys) работают с кропом лица (36×36–128×128), поэтому «грудь в кадре» им не нужна, а крупное лицо для них нормальный случай. **[док/вывод]** Лицо кропается детектором (BlazeFace/Haar) и приводится к фиксированному размеру.
- Но у открытых моделей нет SDK-слоя: confidence/SQI, валидации кадра, калибровки ошибки. Из них готовый SQI даёт только `open-rppg` (0.0–1.0) **[док]**.
- Результаты на MMPD (мобильные камеры, движение, разные свет и тон кожи) показывают, что открытые модели хуже на «грязных» условиях.

### Реалистичность для срока до конца месяца (один разработчик)

Вы указали срок «до конца месяца» (6 дней от 2026-11-24), но CLAUDE.md называет дедлайн конкурса 2026-11-22, то есть уже прошедшим: **сверьте дедлайн** (возможно, продление или другая дата). Любая интеграция новой модели в расширение (ONNX Runtime Web, потоковое состояние, кроп лица, SQI, тесты) отнимает больше, чем остаётся.

### Одна рекомендация

**Оставить SmartSpectra единственным источником пульса и продолжать обход через уменьшение кадра с полями (уже реализовано), но подтвердить его одним замером против эталона (пульсоксиметр или ЭКГ-датчик) на 3–5 записях разной длины, и показывать в интерфейсе только значения со `stable: true`.** Открытую rPPG-модель не подключать.

Почему так:
- Правила конкурса требуют живой сигнал SmartSpectra; замена пульса чужой моделью убирает главный довод проекта.
- Интеграция ME-rPPG в браузер реальна (есть готовое Apache-2.0 демо), но это новая подсистема на неизвестную точность на ваших кадрах, и без SQI.
- Если эталонный замер покажет, что обход даёт ошибки >3 уд/мин, тогда можно открыть ME-rPPG-demo как вторичный индикатор, но не раньше.

### Главные риски

1. **Точность на уменьшенном лице не гарантирована**: это вне зоны валидации Presage; stable/confidence могут быть завышены (документация прямо пишет, что нарушения условий «may produce inaccurate measurements with high confidence»).
2. **Обход непредсказуем между версиями SDK**: порог в документации не описан, при обновлении (3.5.0 вышел 2026-11-10) может сработать иначе.
3. **Лицензия ToS не прочитана**: до публикации репозитория и поста убедиться, что обход валидации и использование в конкурсе разрешены; извлекать веса из пакета не нужно и без прочтения ToS не стоит.
4. **Доки противоречат друг другу** (окно 12/10.6/30 с, диапазон 40–110/40–180/50–150): не опираться на конкретные числа без собственной проверки.
5. **Не медицина**: SDK и FDA-показания предназначены для другого сценария; в тексте для DEV и в интерфейсе избегать медицинских формулировок (правило конкурса).
6. **Онлайн-зависимость**: SDK без сети не работает (нужен интернет для проверки ключа/подписки); для демо-видео и жюри учесть.

## Источники

- https://smartspectra.presagetech.com/llms.txt и llms-full.txt (локальная копия), страницы model-cards-and-limitations.md, measurement-quality.md, telemetry-and-privacy.md, nodejs
- https://vandv.presagetech.com/arterial_pressure_model_card.html , hrv_model_card.html , breathing_model_card.html (страницы обрезаны на разделе 8 «Quantitative Analysis», маппинг confidence-ошибка не получен)
- https://www.accessdata.fda.gov/cdrh_docs/pdf25/K254169.pdf (FDA 510(k))
- https://www.frontiersin.org/journals/medical-technology/articles/10.3389/fmedt.2025.1728913/full
- https://github.com/Presage-Security/SmartSpectra (LICENSE, дерево файлов)
- npm: `@smartspectra/node-sdk@3.5.0`, `@smartspectra/node-sdk-linux-x64@3.5.0` (только список файлов)
- https://github.com/KegangWangCCNU/open-rppg , https://github.com/KegangWangCCNU/ME-rPPG , https://github.com/Health-HCI-Group/ME-rPPG-demo , https://arxiv.org/abs/2504.01774
- https://github.com/ubicomplab/rPPG-Toolbox , https://arxiv.org/pdf/2210.00716
- https://github.com/Rouast-Labs/vitallens-python , https://www.rouast.com/api/
- https://github.com/sb-ai-lab/EmotiEffLib , https://huggingface.co/trpakov/vit-face-expression
- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker

## Что не проверено

- Текст ToS (https://physiology.presagetech.com/tos): страница на JS, не прочитана.
- Содержимое `libsmartspectra.so` и вшитые модели (пульс, выражения): намеренно не разбирал.
- Сетевой трафик SDK не измерял.
- Патенты и публикации Presage по алгоритму: не найдено, но поиск был неглубоким.
- Весовые лицензии ME-rPPG и условия использования AffectNet-весов EmotiEffLib.
