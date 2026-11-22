### 2026-11-17 --:-- CET · [AUDIT] · От: Колян (Claude Sonnet 5.5) → Кому: Женя + Гриша

> Запись в формате журнала: вклеивается в конец `docs/DEVELOPMENT_JOURNAL.md` (append-only), время проставляет тот, кто вклеивает.
> Предмет: Спринт 3.2 «Закалка перед Этапом 4» (ответ Жени на `L-01 … L-19`, запись от 2026-11-16 16:52).

---

# 💌 Женя, Гриша, привет! Спринт 3.2: большой шаг вперёд и два места, которые надо поймать до Этапа 4

Женя, ты закрыл почти весь мой список. Я не просто прочитал отчёт, а проверил код и **запустил** его логику: транспилировал репозиторий, адаптер хранения и WebAuthn-сервис через `tsc 6.0.3` и прогнал сценарии сбоев и эмулятор аутентификатора на Web Crypto Node. Журнал append-only соблюдён (первые 2026 строк идентичны прежним).

Что я **не мог** сделать, как и в прошлый раз: нет сети и `node_modules`, поэтому `vitest`, `eslint`, `vite build` и coverage я не запускал. Цифры из твоего отчёта (47 тестов, покрытие 64.95%, build 1.07s, 43 warning) я не воспроизводил. Число тестов сходится построчным подсчётом: 8+9+3+5+7+5+4+3+3 = 47.

Коротко: работа очень сильная, но у меня два **регресса** (исправление одной проблемы создало другую) и один **незакрытый пробел в миграции**. Все три чинятся быстро, а находки подкреплены воспроизводимыми пробами. 🙂

---

## 1. ✅ Что подтвердилось (проверено запуском)

| Пункт | Что показала проба | Вердикт |
|---|---|---|
| **L-02** outbox | 105 записей `pending_sync` → в хранилище **105** (проба P2) | 🟢 |
| **L-01** (частично) | Ошибка записи `QuotaExceededError` на `chats`: backend остаётся `indexeddb`, health = `degraded`, outbox виден (`PRE`) (проба P3). Больше нет подмены адаптера | 🟢 |
| **L-05** детектор | Все 4 моих обхода (`private_key`, JWK `d`, `apiKey`, числовой `password`) теперь пойманы (P8) | 🟢 |
| **L-06** | Будущая схема v99 → `readOnlyFutureSchema: true`, запись отклоняется с понятной ошибкой (P6) | 🟢 |
| **L-04** WebAuthn | Я собрал эмулятор аутентификатора (P-256, DER-подпись) и проверил `verifyWebAuthnAssertion`: валидная подпись принята; подделка подписи, чужой challenge, чужой origin, чужой rpId-хэш, снятый флаг UP, откат `signCount` отклонены; **300 случайных DER-подписей** (включая 33-байтные r/s) прошли без единой ошибки | 🟢 это настоящая, правильная проверка |
| **L-09** сторож | Реплика сторожа на твоей области (`src` без `__tests__`/`test-utils`, README, REALITY_MAP) даёт **0** нарушений; мета-тест на планте есть | 🟢 |
| **L-08** CSP | Генератор строит prod-политику без `'unsafe-inline'` в `script-src`, без `https:`/`ws:` и без Google Fonts; плагин подменяет meta по режиму. (Живой `dist/index.html` я не собирал) | 🟢 |
| **L-16** | `--ks-pass env:…`, остановка вместо молчаливого создания ключа, единый `filter-repo` в runbook | 🟢 |
| **L-17 / процесс** | `bun.lock` убран, `package-lock.json` есть, TypeScript закреплён как `6.0.3`, зум в `viewport` восстановлен (`user-scalable=no` ушёл) | 🟢 |
| **L-11** | Паттерн «загрузить, потом смонтировать» реально работает в структуре: `useLocalFirstHydration`, `useHydrationCommit`, dirty-флаги и `seq` удалены | 🟢 (с оговоркой N-09) |
| **L-12** | Сохранение теперь идёт раньше смены состояния, есть `try/catch`, повторный вход демо-ключом | 🟢 |

Отдельно хочу отметить две вещи, которые мне особенно понравились:
- **Честность отчёта.** Ты прямо написал «43 унаследованных warning», «CI-файл лежит в `scripts/`, потому что у токена нет scope `workflow`», «`MainActivity` остаётся `PROTOTYPE`». Это ровно та культура, ради которой всё затевалось.
- **Проверка подписи с нуля** в `webAuthnService`: DER→P1363 и три слоя проверок написаны аккуратно, а тест подписывает настоящей парой Web Crypto.

---

## 2. ⚖️ Вердикт

| Блок | Вердикт |
|---|---|
| Спринт 3.2 в целом | 🟡 **Принят с замечаниями.** Основная часть работы принята, но **N-01 и N-02 надо закрыть до Этапа 4**, потому что к outbox скоро подключится сервер |
| Этап 3 («identity + hardening») | 🟡 Закрывать после мини-спринта 3.3 (см. раздел 4) |
| Этап 4 | ⏸️ Не стартовать, пока N-01 и N-02 не закрыты |

---

## 3. 🔎 Находки

Новая нумерация `N-xx`, чтобы не путать с `K-` и `L-`. Пробы называются `P1…P8` (хранилище) и `W1…W14` (WebAuthn).

### 🚨 Блокеры до Этапа 4

#### N-01 · Регресс: одна временная ошибка чтения при старте **перезаписывает реальные данные seed-ом**, а баннер при этом исчезает
Исправляя L-01, адаптер перестал подменяться, и это хорошо. Но `ResilientStorageAdapter.get()` при временной ошибке возвращает `undefined` (shadow пуст), а `validateOrFallback` в репозитории трактует `undefined` как «ключа нет»: берёт seed и **записывает его в основное хранилище** (`needsSeedWrite: true`).

🧪 **Проба P1:** в базе лежит реальное сообщение `REAL-USER-CHAT`. Адаптер один раз падает на чтении `chats` с «transient IO error». После загрузки:
- реального сообщения в хранилище **больше нет** (перезаписано seed-чатом);
- `health` = **`ok`**. Успешная запись seed-а сбросила состояние `degraded`, и баннер пропал.

Хуже, чем до L-01: раньше основная IndexedDB оставалась нетронутой, теперь пользовательские данные затираются молча.

Твой тест «Проба D» этого не ловит: он проверяет `appointments` и массив `chats` (`Array.isArray`) и количество `warnings`, но не то, что **упавший ключ `chats` сохранил реальные данные**. Поэтому тест зелёный.

**Как лучше:**
1. Различай «ключа нет» и «не удалось прочитать». Пусть `get` возвращает результат вида `{ status: 'missing' } | { status: 'ok', value } | { status: 'unreadable', error }`.
2. Для `unreadable` **никогда не запускай seed-запись**. Работай с этой коллекцией в режиме «только чтение/пусто» и покажи баннер: «не удалось прочитать `chats`, данные не затронуты».
3. `health` возвращай в `ok` только если проблемных ключей больше нет, а не после любой удачной записи.
4. Тест: «после ошибки чтения `chats` в хранилище по-прежнему лежит `REAL-USER-CHAT`» (каркас в приложении).

#### N-02 · Поле `origin` добавлено, а версия схемы не поднята: старые данные не мигрируют
`SALON_SCHEMA_VERSION` остаётся `2`, а миграция `v1 → v2` теперь заодно размечает `origin`. Но у всех, кто уже работал на сборках 2.1/3.1, в базе стоит `schemaVersion: 2`, поэтому миграция для них **не запускается** (`while (currentVersion < 2)` не входит).

🧪 **Проба P5:** две записи (appointments) без поля `origin` в базе v2 после загрузки остались с `origin: undefined`. А `filterUserRecords` берёт только `origin === 'user'`. Значит, **настоящие брони, созданные до 3.2, не попадают в экспорт и не будут синхронизироваться** (а это именно цель L-03).

**Как лучше:** поднять `SALON_SCHEMA_VERSION` до 3 и добавить шаг `v2 → v3` («проставить `origin`») с тестом. Заодно переверни умолчание: запись без `origin`, чей `id` не из seed, считать `'user'` (так делает `inferOrigin`; важно, чтобы он действительно вызывался на v2-данных). Теряется не мусор, а данные клиента.

### 🔴 Серьёзные, но не блокеры

#### N-03 · Строгий allowlist стирает **целую коллекцию** при любом незнакомом поле
Идея allowlist верная, но реализация жёсткая. 🧪 **Проба P4:** у одного мастера появилось одно лишнее поле (`newFieldFromV3`), и `artists` целиком сбросилась к seed с предупреждением. Следующая запись пользователя затрёт исходные данные навсегда, и копии нигде нет.

Это ловушка для версий вперёд и назад: любое новое поле в будущей версии делает старый код «подозрительным» и обнуляет данные при откате.

**Как лучше:**
- Валидируй **по записям**, а не по коллекции целиком: плохую запись отправляй в карантин (`quarantine:artists:<время>`), остальные оставляй.
- Неизвестные поля сохраняй (passthrough), кроме секретоподобных (их ловит второй уровень защиты).
- Перед любым «сбросом к seed» делай копию сырых данных, чтобы пользователь мог экспортировать их через аварийный экран.

#### N-04 · Любое сохранение в одной вкладке **перезагружает и размонтирует приложение** во второй
Каждая запись вызывает `notifyOtherTabs()`, причём как минимум дважды за действие (запись коллекции и запись outbox). Вторая вкладка по сообщению вызывает `ensureSeededAndLoad()` и `applyLoadedSnapshot(data, true)`, то есть **увеличивает `resetEpoch`**, а `App` смонтирован как `<SalonApp key={resetEpoch}>`. Значит, во второй вкладке открытая модалка бронирования, незавершённый чекаут, черновик чата и активная вкладка исчезают после каждого лайка в первой. Это видно по коду (я React не запускал).

**Как лучше:** обновлять данные слайсов **без remount** (через стор или `setState` внутри бутстрапа), а полный перемонт оставить только для «Сбросить демо». Либо показывать тихий баннер «данные обновлены в другой вкладке — обновить?». Для всплеска сообщений добавь debounce.

#### N-05 · Проверка WebAuthn: ядро верное, но есть три места «открытой двери»
Ядро проверено (раздел 1). Что осталось, 🧪 пробы W7, W9–W12:

1. **Fail-open без публичного ключа (W11/W12).** Если у записи нет `publicKeySpkiBase64Url` (браузер не отдал `getPublicKey()`) или ключ найден через discoverable-путь, подпись **не проверяется вообще**, но функция возвращает `verified: true`. Я подал мусорную подпись `[9,9,9]`, и она принята (`cryptographicSignatureVerified: false`). Флаг есть, но слово `verified: true` обещает больше.
2. **User Verification не требуется (W7).** Ответ с флагом только `UP` (достаточно коснуться ключа, без PIN/биометрии) принимается, хотя `userVerification: 'preferred'`. Для роли `master` разумнее требовать `UV`.
3. **`signCount` и синхронизируемые Passkey (W9/W10).** Правило «не растёт, значит клон» верно для аппаратных ключей. Но Passkey, синхронизируемые между устройствами, часто возвращают **0** или расходящиеся счётчики. Сейчас `stored=5, got=0` отклоняется, и флаг резервного копирования (`BE`, бит `0x08`) не учитывается (W10), так что пользователь с синхронизированным ключом может оказаться заблокированным.

**Как лучше:**
- Результат делать типом: `verification: 'signature_verified' | 'presence_only'` (вместо одного `verified: true`), а в сессию писать `authMethod` соответственно. Без SPKI не называть вход проверенным.
- Достать публичный ключ из `attestationObject` (COSE), если `getPublicKey()` недоступен.
- Для `master` требовать `UV`; для клиента оставить `preferred`.
- Если `BE`-флаг установлен, откат счётчика считать предупреждением, а не отказом.

#### N-06 · Outbox пишется отдельной транзакцией, а повтор записи ни к чему не подключён
- **Транзакционный outbox.** `persistAppointments` сначала вызывает `saveAppointments` (транзакция 1), потом `recordOutbox` (транзакция 2). Закрытие вкладки между ними теряет «намерение синхронизации»: данные есть, записи в outbox нет. Смысл паттерна именно в **одной транзакции**. Репозиторий уже умеет `setMany([…, meta])`: добавь метод вроде `commitWithOutbox(collection, value, mutation)`, пишущий коллекцию, outbox и meta вместе.
- **Повтор записи.** `retryPendingWrites()` объявлен, но **нигде не вызывается** (поиск по `src/`). Отложенные записи (`pendingRetryKeys`) уходят в хранилище только при следующей успешной записи. Если пользователь закрыл вкладку, они остались только в памяти (проба P3: в основном хранилище остался старый `chats`). Добавь триггеры `visibilitychange`/`pagehide`/`online` и предупреждение `beforeunload`, если буфер не пуст.
- `sanitizeOutboxPayload` убирает PII по **чёрному списку имён ключей** (`clientPhone`, `text`…). Любое новое поле пройдёт. Это тот же приём, от которого мы ушли в L-05. Лучше: allowlist (`id`, `count`, `version`).

### 🟡 Средний приоритет

#### N-07 · Детектор секретов блокирует обычный текст пользователя
🧪 **Проба P8:** сообщение чата «The bearer of good news arrived» и «Please bring Bearer token to the desk» вызывают `Security policy violation`, и сообщение **не сохраняется** (красный баннер, исключение в `persistChats`). Причина: паттерн `\bBearer\s+…` с флагом `i` срабатывает на слово «bearer» в свободном тексте.

**Как лучше:** второй уровень защиты нужен для **структуры**, а не для текста сообщений. Проверяй имена полей и значения в служебных полях, а свободный текст (`text`, `customNotes`) пропускай. Либо сузь паттерн: `Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{20,}` или форму JWT (`eyJ…\.eyJ…`).

#### N-08 · Тесты: что они не ловят и что значит число покрытия
- Тест «Проба D» не проверяет перезапись `chats` (см. N-01). Остальные 7 тестов в `localFirstResilience.test.ts` хорошие.
- `vitest.config.ts` считает покрытие только по `src/domain`, `src/infrastructure`, `src/utils`. Хуки, компоненты, `simulation/` и `services/` **не входят**. Поэтому «64.95%» это покрытие выбранного слоя, а не проекта. Это нормально, но в отчёте и в `REALITY_MAP` лучше написать «покрытие `domain` + `infrastructure` + `utils`».
- В WebAuthn-тесте стоит добавить кейсы W7, W9, W11, W12 из этого письма (сейчас они нигде не зафиксированы).
- CI честно лежит в `scripts/ci.workflow.yml` (у токена нет scope `workflow`). До переноса в `.github/workflows/` он не работает: это стоит держать в `CURRENT_ASSIGNMENT` как явную задачу владельца.

#### N-09 · Расхождения между отчётом/документами и кодом (Закон 8)
- В `useSalonBootstrap` комментарий и отчёт говорят «ref-зеркала удалены», но в файле **остались** `artistsRef`, `reviewsRef`, `anchorPointsRef` и три `useEffect` для их синхронизации. Плюс данные дублируются: `bootstrapData` и отдельные `artists/reviews/anchorPoints` в состоянии. Убрать зеркала можно через `useReducer` или хранить в одном объекте.
- `REALITY_MAP`: «Local-First Resilient Storage Engine: 🟢 REAL». С учётом N-01 и N-02 честнее пока «🟢 REAL, известные ограничения: N-01, N-02» или 🔵 до исправления.
- `docs/ARCHITECTURE_NOTES.md` строка ~235 (раздел 10) всё ещё говорит, что `'unsafe-inline'` оставлен на `script-src`. Раздел 11 это опровергает. Живой документ лучше обновить на месте, а не оставлять два противоположных утверждения.
- В отчёте веб-блокировки и `BroadcastChannel` описаны «в `IndexedDBAdapter`». Они в `salonRepository.ts`. Мелочь, но по Закону 8 пути тоже должны быть точными.

#### N-10 · Приватность и CSP
- `AndroidExperienceView` строит QR через **сторонний сервис** `api.qrserver.com`, куда уходит `window.location.href` (адрес приложения, возможно со своими параметрами). Ради этого он единственный разрешён в `img-src`. Лучше генерировать QR локально (небольшая библиотека или встроенный генератор), и тогда исчезает сторонний хост и в политике, и в приватности.
- CSP в APK: страница грузится как `file://`, а политика строится на `'self'`. Поведение `'self'` для `file:` отличается от `https:`; проверь на устройстве (я не проверял).
- `style-src 'unsafe-inline'` оставлен и честно задокументирован. Для Tailwind и `motion` это допустимо.

#### N-11 · Гигиена и остатки
- `isNonEmptyString` в `schemas.ts` проверяет только `typeof === 'string'`, то есть пустую строку считает «непустой». Название обманывает, а пустой `id` у Passkey проходит валидацию. Переименуй в `isString` или добавь `length > 0`.
- `Date.now()` в идентификаторах: **21** (было 18). Новые вхождения появились в `useBookingFlow` и `CheckoutModal`.
- `CalendarSyncButtons.tsx:57` всё ещё формирует «`$… USD (валюта)`» и русский текст в ссылке Google (K-08.6 открыт).
- `App.tsx` 757 строк (в 3.1 было 659). Хуки теперь без сеттеров, но `App` собирает всё больше колбэков.
- `AndroidExperienceView` 1116 строк и `ClientLocationMap` 671: без изменений.
- В `public/assets/aistudio/` лежит выгруженный файл моего прошлого ревью (48 КБ). Рядом `.gitignore` из одной звёздочки, поэтому в git он не попадёт, но при локальной сборке окажется в `dist/` и будет отдаваться пользователям. Лучше держать такие файлы вне `public/`.
- Доступность: `role="dialog"` в 2 окнах, обработка `Esc` в 1; 27 `aria-label` на 168 кнопок; 43 warning `jsx-a11y` (ты их честно показал).
- Новые русские строки в баннерах и предупреждениях хранилища (`salonRepository`, `App`, `useIdentitySession`) не через `i18n`. Ты это уже записал в бэклог, просто напоминаю.

#### N-12 · Процесс (мягко)
Гриша просил после 3.1 либо паузу, либо узкий «Identity polish», а следующий спринт начинать только после его приёмки. Спринт 3.2 вышел на 9 пунктов и пришёл одним отчётом. Принят он на хорошем уровне, но именно такие объёмы дают наслоение ошибок: N-01 и N-02 появились как побочные эффекты исправлений. Дальше предлагаю маленькие шаги: один блок → `[REPORT]` → `[AUDIT]` → следующий.

---

## 4. 🛠️ Предложение: Спринт 3.3 «Хотфикс хранилища» (короткий, без новых функций)

| # | Что | Пункты |
|---|---|---|
| 1 | Различать «нет данных» и «не прочитано»; не сидировать при `unreadable`; `health` не сбрасывать после чужой записи | N-01 |
| 2 | `SALON_SCHEMA_VERSION = 3`, миграция `v2 → v3` (`origin`), тест на v2-данных | N-02 |
| 3 | Валидация по записям, карантин вместо сброса коллекции, passthrough неизвестных полей | N-03 |
| 4 | Обновление данных между вкладками без remount (или баннер «обновить?») + debounce | N-04 |
| 5 | WebAuthn: тип результата `signature_verified / presence_only`, `UV` для `master`, учёт `BE` | N-05 |
| 6 | `commitWithOutbox` (одна транзакция), триггеры повторной записи, allowlist payload | N-06 |
| 7 | Сузить Bearer-паттерн; проверять структуру, а не свободный текст | N-07 |
| 8 | Тесты из приложения (должны падать сегодня) + описание покрытия в отчёте | N-08 |
| 9 | Обновить `REALITY_MAP` и `ARCHITECTURE_NOTES` (§10/§11) в соответствии с кодом | N-09 |

В бэклог без блокировки: N-10, N-11 (кроме `isNonEmptyString`, это 1 строка), владельцу: перенос CI в `.github/workflows/`, ротация ключа, `filter-repo`.

**Критерий приёмки:** все тесты из приложения зелёные; в `REALITY_MAP` нет утверждения, которое опровергается пробами P1, P4, P5, W7, W11, W12.

---

## 5. 🔭 Что проверено и чего нет

- ✅ **Запускал:** пробы P1–P8 на репозитории и адаптере, W1–W14 на WebAuthn-сервисе (эмулятор аутентификатора, 300 случайных DER-подписей), реплику сторожа (область как в тесте: 0 нарушений), статическую проверку `schemas.ts` в строгом `tsc`, подсчёт тестов и метрик (`Date.now()`, `role="dialog"`, `aria-label`, размеры файлов).
- ✅ **Прочитал целиком:** `indexedDbAdapter`, `salonRepository`, `useSalonBootstrap`, `webAuthnService` (проверка и аутентификация), `secretHygiene`, `domain/identity`, `domain/rating`, `csp.ts`, `vite.config.ts` (плагин CSP), `scripts/ci.workflow.yml`, build-скрипт, runbook, журнал (новые записи), `REALITY_MAP`.
- ⚠️ **Не запускал:** `vitest` (и coverage), `eslint`, `vite build`, настоящий IndexedDB, настоящий WebAuthn в браузере, APK. Выводы про remount во второй вкладке (N-04) сделаны по коду.
- ⚠️ `schemas.ts` (469 строк) читал выборочно (идентичность, паспорт, начало): остальные валидаторы только по структуре.
- Нет `.git` в архиве: коммиты и сообщения не видел.

---

## 6. 🙏 Вместо прощания

Женя, за два дня ты прошёл дорогу, на которую многие тратят месяцы: честность текстов, слои, отказоустойчивое хранилище, Passkeys с настоящей проверкой подписи, CI-шаблон. Мои замечания в основном про **края**: что происходит при сбое чтения, при старых данных, при второй вкладке. Это и есть то, что отличает «работает на демо» от «можно подключать сервер».

Если выбрать одно на завтра, то N-01 и N-02: оба чинятся за вечер, а цена ошибки растёт с каждым днём, пока к outbox не подключился сервер.

😄 **Анекдот в традициях журнала:**

> Приходит `ResilientStorageAdapter` к `SalonRepository` на разбор полётов.
> — Я теперь не подменяю хранилище при сбое! — гордо говорит адаптер.
> — Молодец, — кивает репозиторий. — А когда ты не смог прочитать `chats`, что ты мне вернул?
> — `undefined`.
> — А что я с этим сделал?
> — …записал seed.
> — Вот именно. «Не смог прочитать» и «там пусто» это разные вещи.
> Гриша из угла: — Запишите в протокол. И заведите отдельный статус для «не знаю».

Жму руку обоим. Жду ответа построчно по `N-01 … N-12` в журнале.

С теплом и уважением,
**Колян** (Claude Sonnet 5.5)
Третья пара глаз NailiX / Onyx-Aura

---

## 📎 Приложение: каркасы тестов (должны падать сегодня)

Поведения ниже воспроизведены моими пробами, но в самом `vitest` файлы **не запускались**. Подгони импорты под свои пути.

```ts
// src/__tests__/localFirstHotfix.test.ts
import { describe, it, expect } from 'vitest';
import { SalonRepository } from '../infrastructure/storage/salonRepository';
import { MemoryStorageAdapter } from '../infrastructure/storage/indexedDbAdapter';
import { assertNoSecretLikeFields } from '../infrastructure/identity/secretHygiene';

async function seededMapWithRealChat() {
  const map = new Map<string, unknown>();
  const repo = new SalonRepository(new MemoryStorageAdapter(map));
  const data = await repo.ensureSeededAndLoad();
  await repo.saveChats([...data.chats, { ...data.chats[0], id: 'REAL-USER-CHAT', text: 'real', origin: 'user' }]);
  return map;
}

describe('N-01 transient read error must never overwrite real data', () => {
  it('keeps REAL-USER-CHAT in storage after one unreadable "chats" read', async () => {
    const map = await seededMapWithRealChat();
    class ReadFlaky extends MemoryStorageAdapter {
      async get<T>(key: Parameters<MemoryStorageAdapter['get']>[0]) {
        if (key === 'chats') throw new Error('transient IO error');
        return super.get<T>(key);
      }
    }
    await new SalonRepository(new ReadFlaky(map)).ensureSeededAndLoad();
    expect(JSON.stringify(map.get('chats'))).toContain('REAL-USER-CHAT'); // today: false
  });
});

describe('N-02 legacy v2 records get an origin', () => {
  it('tags user records created before 3.2 as origin="user"', async () => {
    const map = new Map<string, unknown>();
    await new SalonRepository(new MemoryStorageAdapter(map)).ensureSeededAndLoad();
    const legacy = (map.get('appointments') as Array<Record<string, unknown>>).map(a => {
      const copy = { ...a, id: 'USER-' + a.id };
      delete copy.origin;
      return copy;
    });
    map.set('appointments', legacy);
    const data = await new SalonRepository(new MemoryStorageAdapter(map)).ensureSeededAndLoad();
    expect(data.appointments.every(a => a.origin === 'user')).toBe(true); // today: undefined
  });
});

describe('N-03 one unknown field must not wipe a collection', () => {
  it('keeps the user collection and quarantines/ignores only the odd field', async () => {
    const map = new Map<string, unknown>();
    await new SalonRepository(new MemoryStorageAdapter(map)).ensureSeededAndLoad();
    const artists = map.get('artists') as Array<Record<string, unknown>>;
    artists[0].rating = 4.11; artists[0].newFieldFromV3 = 'x';
    map.set('artists', artists);
    const data = await new SalonRepository(new MemoryStorageAdapter(map)).ensureSeededAndLoad();
    expect(data.artists[0].rating).toBe(4.11); // today: seed value
  });
});

describe('N-07 harmless chat text is not a secret', () => {
  it.each(['The bearer of good news arrived', 'Please bring Bearer token to the desk'])('allows "%s"', text => {
    expect(() => assertNoSecretLikeFields([{ text }])).not.toThrow(); // today: throws
  });
});
```

```ts
// WebAuthn (add to webAuthnIdentity.test.ts, reuse your P-256 helper)
// W7: assertion with flags = UP only (no UV) must be rejected when UV is required for master.
// W11/W12: without a stored public key the result must NOT be reported as verified:
//   expect(result.verification).toBe('presence_only');   // today: verified: true with a bogus signature
// W10: with BE flag (0x08|UP|UV) a counter rollback must be a warning, not a hard failure.
```
