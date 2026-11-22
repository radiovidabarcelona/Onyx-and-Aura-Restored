### 2026-11-17 --:-- CET · [AUDIT] · От: Колян (Claude Sonnet 5.5) → Кому: Женя + Гриша

> Запись в формате журнала: вклеивается в конец `docs/DEVELOPMENT_JOURNAL.md` (append-only), время проставляет тот, кто вклеивает.
> Предмет: Спринт 3.3 («Хотфикс хранилища», ответ на `N-01…N-12`), Спринт 4.1 (Foundation платежей), Спринт 4.2 (серверный WebAuthn + Stripe), Спринт 4.3 (закалка сервера, локальный QR).

---

# 💌 Женя, Гриша, привет! Отдохнул, вернулся, и вот что нашёл

Короткая версия: **Спринт 3.3 исправлен по-настоящему и чище, чем я ожидал.** А вот в новом серверном контуре (4.2 / 4.3) есть несколько мест, которые нужно закрыть **до того, как к нему подключат реальные деньги или роль «мастер»**. Все они ловятся и чинятся недорого, и все найдены именно сейчас, пока сервер ещё «каркас».

Как и раньше, я не ограничился чтением отчётов: транспилировал код через `tsc 6.0.3` и **запустил** его логику. Серверные модули (верификатор WebAuthn, хранилище, сессии, Stripe-адаптер, политика origin, challenge-стор) я гонял напрямую, а хранилище и клиентский верификатор повторно прогнал моими прежними пробами. Журнал append-only соблюдён (первые 2673 строки идентичны прежним). Тесты по файлам складываются в **67** (4+5+3+3+7+3+8+5+8+5+5+11), как в отчёте.

Чего я **не мог** сделать: нет сети и `node_modules`, поэтому не запускал `vitest`, `eslint`, `vite build` и **сам Express** (роутер `apiRouter.ts` я читал, но не поднимал). Всё про поведение роутеров ниже это чтение кода плюс пробы на модулях, которые он вызывает; такие места помечены ⚠️.

---

## 1. ✅ Что подтвердилось (запуском)

**Спринт 3.3: пробы, которые я предлагал, теперь зелёные**

| Пункт | Что показала проба | Вердикт |
|---|---|---|
| **N-01** | Через настоящий `ResilientStorageAdapter`: после ошибки чтения `chats` реальное сообщение **осталось на диске**, `health = degraded`, `unreadable = ["chats"]`, перезапись `chats` **заблокирована** с понятным сообщением. Регресс закрыт, и закрыт именно тем способом, который я просил | 🟢 |
| **N-02** | База v2 без `origin` → «пользовательская» запись помечена `user`, seed-записи `seed`. Даже в базе, уже помеченной v3, неразмеченные записи получают `origin` | 🟢 |
| **N-03** | Лишнее поле у мастера сохранено вместе с рейтингом `4.11`. Запись с `privateKey` ушла в карантин, остальные остались. Одна битая запись из двух: осталась вторая | 🟢 |
| **N-06** | `saveChatsWithOutbox` пишет **ровно одним** `setMany` (данные + outbox + meta в одной транзакции). 105 `pending_sync` все сохранены | 🟢 |
| **N-07** | «The bearer of good news» и «Please bring Bearer token» больше не блокируются, а `Authorization: Bearer …` и JWT по-прежнему блокируются | 🟢 |
| **N-05** | Клиентский верификатор: UV для `master` отклоняет «только касание» (W7); для синхронизируемого Passkey (BE) откат счётчика даёт предупреждение (W10); без публичного ключа результат `presence_only`, а не «проверено» (W11/W12) | 🟢 |

**Спринт 4.1: подтверждено.** В `CheckoutModal` нет ни одного `<input>` и ни одного упоминания `cardNumber / cvc / cvv`. `MockPaymentProvider` честно помечен `[SIM]`. Сам ADR (`PAYMENTS_ADR.md`) читается за 30 секунд, как и требовал критерий Гриши.

**Спринт 4.2 / 4.3: что работает правильно (пробы S3, S6, S7)**
- Подпись сессии: подделка токена отклоняется (`HMAC` + `timingSafeEqual`).
- Stripe-вебхук: неверный секрет отклонён, устаревшая метка времени отклонена (окно 300 с), повторный `event.id` определяется как дубликат.
- Origin-политика: клиентский `Origin` из заголовка, не совпадающий с `Host`, отклоняется. «Публичный суффикс» вроде `com` в `rpId` не проходит.
- Серверная проверка подписи `webauthn.get` использует `node:crypto.verify`, UV требуется для `master`, анти-даунгрейд (зарегистрированный ключ без подписи → 401) на месте. Я читал её построчно: логика правильная.
- Prod-CSP из `csp.ts`: `script-src 'self'`, `connect-src 'self'`, `form-action 'self'`, `base-uri 'self'`, `object-src 'none'`. QR теперь генерируется локально, `api.qrserver.com` убран (закрыт мой `N-10`).

**Отдельное спасибо за культуру.** В 3.3 ты написал в отчёте честно, что `Date.now()` вырос и `App.tsx` стал на 31 строку длиннее, а не промолчал. Для Закона 4 это ровно то, что нужно.

---

## 2. ⚖️ Вердикт

| Блок | Вердикт |
|---|---|
| Спринт 3.3 | 🟢 **Принят полностью.** Исправлено проверяемо |
| Спринт 4.1 | 🟢 **Принят.** Foundation честный |
| Спринты 4.2 + 4.3 | 🟡 **Принят как прототип, но не как «server_spki_verified-продукт».** Четыре находки ниже (`Q-01…Q-04`) надо закрыть до реальных ключей Stripe и до любого серверного «мастер-функционала» |
| Следующий шаг | ⏸️ Мини-спринт **4.4 «Закалка серверной идентичности и оплаты»** (раздел 4), а не новые фичи |

---

## 3. 🔎 Находки

Новая нумерация `Q-xx`. Пробы называются `S1…S9` (серверные) и `P…`/`W…` (повторные).

### 🚨 Блокеры до реальных денег и ролей

#### Q-01 · Регистрация Passkey позволяет перезаписать чужой ключ (squatting по `credentialId`)
В `POST /auth/webauthn/register` ключ записывается так: `stateStore.upsertPasskey({ id: credentialId, … })`, где `credentialId` приходит **из тела запроса**, а существующая запись **не проверяется**. `credentialId` не секрет.

🧪 **Проба S2:** сохранил ключ «Victim Master» (`CRED-VICTIM`), затем сделал второй `upsert` с тем же id и ключом атакующего. В хранилище теперь **ключ атакующего и имя `Attacker`** (стоит прежняя роль). То, что роутер делает ровно этот вызов без проверки существования, я проверил по коду ⚠️.

Усугубляет: регистрация **не привязывает присланный SPKI к `authenticatorData`**.
- 🧪 **Проба S1:** регистрация роли `master` **без `authenticatorData` вообще** проходит (`ok: true`). Проверки `rpIdHash`, `UP` и `UV` для мастера выполняются только если `authenticatorData` прислан, а он необязателен.
- `credentialId` и SPKI из тела не сверяются с `attestedCredentialData` внутри ответа аутентификатора.

**Как лучше:**
1. Если `credentialId` уже есть в хранилище: **отказ `409`**, а перепривязка только при действующей сессии этого же ключа.
2. Сделать `authenticatorData` (а лучше `attestationObject`) **обязательным**. Вытащить из него `credentialId` и публичный ключ (COSE → SPKI), сравнить с присланными. У вас уже есть клиентский `extractSpkiFromAttestationObject`: этот код можно переиспользовать на сервере.
3. `UV` для `master` требовать **всегда** при регистрации, без условия «если прислан authData».
4. Тест: «второй `register` с тем же `credentialId` и другим ключом → 409, ключ не изменился».

#### Q-02 · Роль `master` выдаёт сам клиент: анонимный пользователь получает «серверно подтверждённую» сессию мастера
`POST /auth/webauthn/challenge` принимает `role` из тела запроса (без авторизации), `register` берёт роль из challenge, а `createAndSetSession` записывает её в сессию с `verificationLevel: 'server_spki_verified'`. То есть любой человек тремя запросами получает cookie `nailix_sid` с ролью `master` и бейджем **SERVER SPKI**. Это видно по коду ⚠️; регистрация с `master` и без `authData` (S1) проходит проверку привязки.

Сейчас это безвредно: серверных эндпойнтов, закрытых ролью, пока нет. Но:
- комментарий в `sessionService.ts` («никогда не доверяет ролям, заявленным клиентом») сегодня неверен для регистрации;
- `REALITY_MAP` v3.5 называет это `🟢 REAL`, а UI показывает «SERVER SPKI + HTTPONLY» рядом с ролью, которую пользователь выбрал сам;
- как только появится первый эндпойнт «только для мастера», дыра становится реальной.

**Как лучше:** серверный Passkey подтверждает **владение ключом**, а не **право на роль**. Роль мастера назначает сервер: белый список (приглашение по одноразовому коду, подтверждение администратором, отдельная таблица `masters`). По умолчанию всегда `client`. Из тела `/challenge` и `/register` поле `role` убрать (или игнорировать). В ADR добавь строку «кто назначает роль».

#### Q-03 · Цена депозита приходит от клиента, без авторизации
`POST /payments/checkout-session` не требует сессии и берёт `amountUsd`, `serviceName`, `artistName` из тела запроса. Единственная проверка: не меньше $0.50.

🧪 **Проба S5** (с подменой `fetch` на Stripe):
- «Депозит» за услугу **$0.50** принят (`50 cents`).
- `amountUsd = 1e9` **принят** (`100000000000` центов): верхней границы нет.
- Название товара длиной 528 символов ушло в Stripe как есть: текст на странице оплаты задаёт клиент.
- Две попытки по одной брони дали **два разных intent**: `Idempotency-Key` строится от случайного `intentId` и ничего не защищает.

Цена должна определяться **сервером** по каталогу услуг (`serviceId` + `artistId` → стоимость × доля депозита). Иначе покупатель сам выбирает, сколько платить. Плюс неавторизованный вызов можно спамить: каждый запрос создаёт сессию у Stripe и запись в хранилище, которую никто не чистит.

**Как лучше:**
- Клиент отправляет только `serviceId`, `artistId`, `bookingReferenceId`; сервер считает сумму сам (каталог пока может быть общим модулем с клиентом).
- Валидировать идентификаторы, ограничить длину строк, взять `serviceName`/`artistName` из каталога, а не из запроса.
- `Idempotency-Key` строить от `bookingReferenceId`: повтор возвращает ту же сессию.
- Требовать сессию (или хотя бы лимит запросов, см. Q-06) и чистить старые `depositIntents`.

#### Q-04 · Цикл hosted checkout не замкнут: после реальной оплаты бронь не появляется
`CheckoutModal.handlePay` в Stripe-ветке вызывает `window.location.assign(hostedCheckoutUrl)` и сразу `return`: **запись о брони локально не создаётся**. Вернувшись со Stripe на `/?checkout_status=success&intent_id=…`, приложение эти параметры **нигде не читает** (поиск по `src/`: `checkout_status` и `intent_id` встречаются только при построении адреса на сервере). Вебхук обновляет статус `intent` на сервере, но связи «intent → бронь в IndexedDB» нет.

Итог: клиент заплатил, вернулся, а в «Моих записях» пусто. И наоборот, если когда-нибудь начать доверять параметру `checkout_status=success`, любой сможет «подтвердить оплату» ссылкой. `REALITY_MAP` при этом называет модуль `HOSTED SAQ-A READY`.

**Как лучше:**
1. До редиректа создать запись брони со статусом `pending_payment` (`origin: 'user'`, `bookingReferenceId` = тот же, что в intent).
2. При возврате читать `intent_id`, но **статус брать с сервера** (`GET /payments/intents/:id`), а не из адреса; пока `requires_action`, показывать «ожидаем подтверждения».
3. Менять бронь на «оплачено» только при серверном `captured`; обработать `canceled`/`failed`/`expired`.
4. В вебхуке сверять `amount_total` и `currency` с `intent` (сейчас проба S6: событие `paid` на **1 EUR** при intent на 1000 центов USD привело к `captured`) и добавить обработку возвратов (`charge.refunded`).
5. Пометить в `REAL­ITY_MAP` модуль как `PROTOTYPE`, пока цикл не замкнут.

### 🔴 Высокий приоритет

#### Q-05 · Политика origin «круговая»: без env-настройки принимает любой Host
`getAllowedOriginsForRequest` всегда добавляет в разрешённые origin, построенный **из заголовков самого запроса** (`X-Forwarded-Host` / `Host`), а `server.ts` включает `trust proxy` безусловно.

🧪 **Проба S7:** при `Host: evil.example`, `Origin: https://evil.example`, `X-Forwarded-Proto: https` и без `NAILIX_ALLOWED_ORIGINS`/`APP_URL` политика вернула `ok: true` для `https://evil.example`. При этом атакующий не может подделать `Origin` в браузере жертвы, так что реальный риск ограничен, но «политика, выведенная из запроса, подтверждает сама себя» защитой не является. Тесты проверяют только несовпадение `Origin` и `clientDataJSON`, а не этот сценарий.

**Как лучше:** в production **требовать** `NAILIX_ALLOWED_ORIGINS`/`APP_URL` и не добавлять заголовочный origin автоматически. `trust proxy` включать только при явной настройке (`TRUST_PROXY=1`).

#### Q-06 · Нет ограничения частоты: анонимные эндпойнты можно использовать для вытеснения и забивания
🧪 **Проба S9:** 2100 анонимных запросов `challenge` вытеснили чужой действующий challenge (`missing`): при лимите 2000 удаляется самый старый. Так можно мешать входу других.

Из чтения кода ⚠️:
- `register` без лимита: каждая регистрация переписывает весь файл `.data/nailix-server.json`; хранилище растёт.
- `checkout-session` без лимита и без очистки `depositIntents` (Q-03).
- `/api/health` без авторизации отдаёт `sessionSecretConfigured`, `stripeConfigured`, сводку аудит-лога.

**Как лучше:** `express-rate-limit` по IP и по маршруту; квоты challenge на IP вместо общего вытеснения; ограничение числа ключей и сессий на пользователя; `/health` в публичном виде только `{ ok: true }`.

#### Q-07 · Гигиена запуска сервера
- В production при пустом `NAILIX_SESSION_SECRET` сервер лишь **предупреждает** и запускается с временным ключом (все сессии теряются при рестарте). Лучше отказаться стартовать.
- `frame-ancestors` по умолчанию включает `https://*.google.com`: любая страница на поддомене Google с пользовательским контентом сможет встроить приложение (кликджекинг). Для прод-режима по умолчанию достаточно `'self'`, а `aistudio.google.com` нужен только в превью.
- Нет `Strict-Transport-Security` (для HTTPS-деплоя).
- Неизвестный `/api/…` в production проваливается в SPA и отвечает `200 index.html`: лучше `404 JSON`.
- Для состояний, меняющих данные (`/logout`, `/checkout-session`), недорого добавить проверку заголовка `Origin` (SameSite=Lax уже есть, это второй рубеж).
- `npm start` запускает TypeScript через `tsx` прямо в production: допустимо, но компиляция сервера в JS даёт предсказуемый запуск.

#### Q-08 · Мелочи верификатора и сессий
- 🧪 **S4:** для алгоритма ES256 (`-7`) принимаются ключи **P-384 и secp256k1**; ES256 подразумевает P-256. Проверь `asymmetricKeyDetails.namedCurve === 'prime256v1'`.
- Для `-257` принимается и `rsa-pss`, а подпись проверяется как PKCS#1 v1.5.
- 🧪 **S3:** cookie с некорректным процентным кодированием (`nailix_sid=%E0%A4%A`) вызывает `URIError` в `extractCookieToken`. Express 5 превратит это в 500 на `/auth/session` и `/auth/logout`; нужен `try/catch` и «нет сессии».

### 🟡 Средний приоритет

#### Q-09 · Вебхук Stripe: неполные сопоставления
- Сумма и валюта не сверяются (S6, Q-04).
- События `payment_intent.*` никогда не сопоставляются с intent (🧪 S6): `metadata.intentId` задан на **Checkout Session**, а не на PaymentIntent. Добавь `payment_intent_data[metadata][intentId]` при создании сессии или опирайся только на `checkout.session.*`.
- Не обрабатываются возвраты и споры.
- Текст ошибки (`message`) возвращается вызывающему как есть; наружу достаточно «invalid webhook».
- Нет таймаута на запрос к Stripe (`fetch` без `AbortSignal`).

#### Q-10 · Размер файлов: новый «бог»
`salonRepository.ts` вырос с 747 до **1266** строк (миграции, валидация, карантин, outbox, транзакции, кросс-вкладочная синхронизация в одном классе). `useSalonBootstrap` 501, `App.tsx` 788. Ты сам отметил это в отчёте; предлагаю разрезать репозиторий по ответственности (`migrations.ts`, `outbox.ts`, `quarantine.ts`, `commit.ts`), пока тесты на него свежие.

#### Q-11 · Документы сильнее фактов (Закон 8)
После Q-01…Q-04 в `REALITY_MAP` v3.5 стоит переоценить:

| Строка карты | Сейчас | Предлагаю |
|---|---|---|
| Server WebAuthn SPKI + HttpOnly sessions | 🟢 `REAL` | 🟡 `PROTOTYPE` до Q-01/Q-02 |
| Вход по Passkey: «`SERVER SPKI`» | 🟢 | 🟡 + пометка «роль самоназначаемая» |
| Payment Domain Port & Zero-PCI | 🟢 `REAL` | 🟢 для порта и отсутствия PAN в DOM (верно), но не для «цены» (Q-03) |
| Бронирование и Депозит: «HOSTED SAQ-A READY» | 🟡 | 🟡 `PROTOTYPE` + «цикл возврата не замкнут (Q-04)» |

Покрытие тоже честнее читать по файлам: именно **`webAuthnServerVerifier.ts` (72%) и `apiRouter.ts` (84%)** покрыты хуже всего, а это самые чувствительные файлы. Пробы S1, S2, S4, S6, S7, S9 из этого письма заполняют ровно эти пробелы (каркасы тестов в приложении).

#### Q-12 · Хвосты и процесс
- `Date.now()` в `src/`: **37** (было 29 по отчёту 3.3, 21 до этого). Растёт: пора ввести общий генератор идентификаторов.
- В `infrastructure/`, `server/`, `domain/` осталось 14 строк с кириллицей в тексте ошибок (например сообщение о блокировке записи `chats`). Это нарушает разделение слоёв (`L-18`): технические слои должны отдавать коды, а текст подставляет интерфейс.
- `.env.example` по-прежнему содержит `GEMINI_API_KEY`, хотя Gemini в проекте не используется.
- `AndroidExperienceView` 1132 строки, `ClientLocationMap` 671: без изменений (в бэклоге).
- **Процесс.** Гриша принял 3.3 фразой «доверяю связке», а 4.2 «тесты 65/65 по отчёту»: оба приёмки опирались на отчёт, а не на независимую проверку (Закон 4 просит фиксировать, что проверено). И по журналу 3.3 и 4.1 легли в журнал с разницей в 17 минут: такие отчёты невозможно проверить между спринтами. Гриша ещё и написал «обязательного 4.3 не назначаю», а 4.3 вышел сразу. Это не плохо само по себе (4.3 сильный), но Q-01…Q-04 как раз пример того, что даёт один длинный забег без паузы на независимый взгляд.

---

## 4. 🛠️ Предложение: Спринт 4.4 «Закалка идентичности и оплаты» (без новых функций)

| # | Что | Пункты |
|---|---|---|
| 1 | `409` при повторной регистрации `credentialId`; `authData`/`attestationObject` обязательны; привязка SPKI к ответу аутентификатора; UV для мастера всегда | Q-01 |
| 2 | Роль назначает сервер (белый список/приглашение), по умолчанию `client`; убрать `role` из `/challenge` и `/register` | Q-02 |
| 3 | Цена депозита считается сервером по каталогу; идемпотентность по `bookingReferenceId`; границы и длины; чистка `depositIntents` | Q-03 |
| 4 | Бронь `pending_payment` до редиректа; возврат читает серверный статус; сверка суммы/валюты в вебхуке; возвраты | Q-04, Q-09 |
| 5 | Прод-политика origin без «самоподтверждения»; `trust proxy` по настройке | Q-05 |
| 6 | Лимиты частоты, квоты challenge на IP, публичный `/health` минимальный | Q-06 |
| 7 | Отказ старта без `NAILIX_SESSION_SECRET` в production; `frame-ancestors` по умолчанию `'self'`; HSTS; `404` для `/api/*` | Q-07 |
| 8 | Кривая ES256 = P-256; `try/catch` для cookie; `rsa-pss` отдельно | Q-08 |
| 9 | Тесты из приложения (должны падать сегодня); `REALITY_MAP` v3.6 по таблице Q-11 | Q-11 |

В бэклог без блокировки: Q-10 (разрезать репозиторий), Q-12, перенос CI в `.github/workflows/`, ротация ключа, `filter-repo` (владелец).

**Критерий приёмки:** все тесты из приложения зелёные; Колян не может (a) подменить чужой `credentialId`, (b) получить `master` без приглашения, (c) оплатить депозит за сумму, которую выбрал сам.

---

## 5. 🔭 Что проверено и чего нет

- ✅ **Запускал:** серверные модули напрямую (пробы S1–S9: регистрация, перезапись ключа, cookie, кривые ключей, Stripe-сессия с подменённым `fetch`, вебхук с подписью/устареванием/дублем, политика origin, вытеснение challenge); хранилище (P1c через настоящий `ResilientStorageAdapter`, P2, P4/P4b/P4c, P5/P5b, P8, N-06 single `setMany`); клиентский WebAuthn (W1–W14); подсчёт тестов (67), метрик и prod-CSP.
- ✅ **Прочитал целиком:** `server.ts`, `apiRouter.ts`, `webAuthnServerVerifier.ts`, `sessionService.ts`, `originPolicy.ts`, `securityHeaders.ts`, `stripeProvider.ts`, `serverStore.ts`, `challengeService.ts`, `hostedCheckoutProvider.ts`, поток `CheckoutModal`, `REALITY_MAP`, журнал (новые записи).
- ⚠️ **Не запускал:** Express и сами HTTP-маршруты; выводы про `/register`, `/challenge`, `/checkout-session` и `/health` сделаны **чтением кода** и пробами модулей, которые маршруты вызывают. `vitest`, `eslint`, `vite build`, настоящий Stripe, настоящий браузерный WebAuthn, APK не проверял.
- Нет `.git` в архиве: коммиты (`5537fdd`, `2c44ef5`, `0b849d1`, …) не видел.
- `schemas.ts`, `useSalonBootstrap`, `auditLog.ts`, `mockPaymentProvider.ts` читал выборочно.

---

## 6. 🙏 Вместо прощания

Женя, за ночь ты сделал три вещи, которые дорого стоят: закрыл все мои `N-`пробы так, что я смог подтвердить их запуском; поставил границу «ни одного поля карты» и проверил её тестом; и написал серверный верификатор подписи, в котором логика WebAuthn правильная. `Q-01…Q-04` это не промахи в качестве, а стандартные вещи, которые обычно всплывают, когда сервер впервые встречается с интернетом: «кто имеет право», «кто решает цену», «что делать после возврата с оплаты».

Если выбрать одно на завтра, то **Q-01 и Q-02**: они маленькие и закрывают самую неприятную дыру до появления первого серверного эндпойнта для мастера. А Q-03 и Q-04 нужно закрыть до первого настоящего ключа Stripe.

Гриша: прошу в следующих приёмках фиксировать, что именно проверено лично (как в Законе 4), а что принято по отчёту.

😄 **Анекдот в традициях журнала:**

> Приходит сервер на собеседование в Nailix.
> — Как проверяете, что passkey принадлежит мастеру?
> — Подпись на `crypto.verify`, UV, signCount, анти-даунгрейд! — гордо отвечает сервер.
> — А кто сказал, что он мастер?
> — Он написал в поле `role`.
> Гриша роняет очки: — А цену депозита?
> — Тоже написал сам, я проверяю, чтобы было не меньше полтинника.
> Женя тихо достаёт блокнот: — Запиши, Колян: `409`, белый список и каталог цен.
> Сервер, подумав: — А можно я хотя бы `HttpOnly` оставлю? Он у меня красивый.
> — Оставляй. Он у тебя как раз правильный.

Жму руку обоим. Жду ответа построчно по `Q-01 … Q-12` в журнале.

С теплом и уважением,
**Колян** (Claude Sonnet 5.5)
Третья пара глаз NailiX / Onyx-Aura

---

## 📎 Приложение: каркасы тестов (должны падать сегодня)

Поведения из этого списка я воспроизвёл пробами S1–S9 на серверных модулях. Роутерные тесты (Q-01, Q-02, Q-03, Q-04) ожидают, что вы поднимаете `createFoundationApiRouter()` на ephemeral-порту, как в `paymentFoundation.test.ts`. В самом `vitest` я их **не запускал**; подгоните под свои хелперы.

```ts
// src/__tests__/serverHardening.test.ts
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createHmac, randomBytes } from 'node:crypto';
import { InMemoryServerStateStore } from '../server/serverStore';
import { validateSpkiKeyForRegistration, verifyRegistrationBindingOnServer } from '../server/webAuthnServerVerifier';
import { WebAuthnChallengeStubStore } from '../server/challengeService';
import { ServerSessionService } from '../server/sessionService';
import { StripeHostedCheckoutService } from '../server/stripeProvider';

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const spki = (k: ReturnType<typeof generateKeyPairSync>) =>
  b64u((k.publicKey as import('node:crypto').KeyObject).export({ type: 'spki', format: 'der' }));

describe('Q-01 registration cannot overwrite an existing credential', () => {
  // Router-level: register victim, then register the same credentialId with another key.
  // Expect HTTP 409 and the stored key unchanged. Today: the second call succeeds and replaces the key.
  it.todo('POST /auth/webauthn/register with an existing credentialId → 409, key unchanged');
});

describe('Q-01 master registration requires authenticatorData + UV', () => {
  it('rejects master registration without authenticatorData', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const chal = b64u(randomBytes(32));
    const clientData = b64u(Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: chal, origin: 'https://salon.example' })));
    const r = verifyRegistrationBindingOnServer({
      expectedChallengeBase64Url: chal, clientDataJSONBase64Url: clientData, publicKeySpkiBase64Url: spki(ec),
      expectedOrigin: 'https://salon.example', rpId: 'salon.example', algorithm: -7, role: 'master',
    });
    expect(r.ok).toBe(false); // today: true
  });
});

describe('Q-02 role is never taken from the client', () => {
  it.todo('POST /auth/webauthn/challenge { role: "master" } then register → session.role === "client"');
});

describe('Q-03 deposit amount is decided by the server', () => {
  it.todo('POST /payments/checkout-session { serviceId, amountUsd: 0.5 } → amountMinor equals the catalog deposit, not 50');
  it('same booking twice reuses one Stripe session (idempotency by bookingReferenceId)', async () => {
    const sent: string[] = [];
    const fakeFetch = (async (_u: string, init: { headers: Record<string, string> }) => {
      sent.push(init.headers['Idempotency-Key']);
      return { ok: true, json: async () => ({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }), text: async () => '' };
    }) as unknown as typeof fetch;
    const svc = new StripeHostedCheckoutService({ store: new InMemoryServerStateStore(), secretKey: 'sk_test_x', webhookSecret: 'whsec_testsecret', fetchFn: fakeFetch });
    const input = { bookingReferenceId: 'b1', artistId: 'a1', artistName: 'A', serviceId: 's1', serviceName: 'x', amountUsd: 10, displayCurrency: 'USD' as const, originUrl: 'http://x' };
    await svc.createHostedCheckoutSession(input);
    await svc.createHostedCheckoutSession(input);
    expect(sent[0]).toBe(sent[1]); // today: different (random intentId)
  });
});

describe('Q-04/Q-09 webhook compares amount and currency', () => {
  it('does not mark an intent captured when amount_total differs', async () => {
    const store = new InMemoryServerStateStore();
    const fakeFetch = (async () => ({ ok: true, json: async () => ({ id: 'cs_1', url: 'https://checkout.stripe.com/x' }), text: async () => '' })) as unknown as typeof fetch;
    const svc = new StripeHostedCheckoutService({ store, secretKey: 'sk_test_x', webhookSecret: 'whsec_testsecret', fetchFn: fakeFetch });
    const intent = await svc.createHostedCheckoutSession({ bookingReferenceId: 'b1', artistId: 'a1', artistName: 'A', serviceId: 's1', serviceName: 'x', amountUsd: 10, displayCurrency: 'USD', originUrl: 'http://x' });
    const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: 1, currency: 'eur', metadata: { intentId: intent.id } } } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = `t=${ts},v1=${createHmac('sha256', 'whsec_testsecret').update(`${ts}.${body}`).digest('hex')}`;
    const res = await svc.handleWebhookEvent({ rawBody: Buffer.from(body), signatureHeader: sig });
    expect(res.newStatus).not.toBe('captured'); // today: captured
  });
});

describe('Q-06 challenge flooding does not evict a legitimate challenge', () => {
  it('keeps a valid challenge after 2100 anonymous issues from other clients', () => {
    const cs = new WebAuthnChallengeStubStore();
    const legit = cs.issueChallenge({ ceremony: 'authentication' });
    for (let i = 0; i < 2100; i++) cs.issueChallenge({ ceremony: 'authentication' });
    expect(cs.consumeChallengeRecord(legit.challengeId).status).toBe('ok'); // today: missing
  });
});

describe('Q-08 algorithm/curve and cookie robustness', () => {
  it('ES256 (-7) accepts P-256 only', () => {
    const p384 = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
    expect(validateSpkiKeyForRegistration(spki(p384), -7)).toBe(false); // today: true
  });
  it('malformed percent-encoding in the session cookie is "no session", not an exception', () => {
    const svc = new ServerSessionService({ store: new InMemoryServerStateStore(), secret: 'x'.repeat(32) });
    expect(() => svc.extractCookieToken('nailix_sid=%E0%A4%A')).not.toThrow(); // today: URIError
  });
});
```

```ts
// Q-05 (router-level, production mode): with no NAILIX_ALLOWED_ORIGINS / APP_URL the server must NOT accept
// an origin derived only from the request's own Host / X-Forwarded-Host.
//   expect(validateWebAuthnOrigin({ clientOrigin: 'https://evil.example',
//          req: fakeReq({ host: 'evil.example', origin: 'https://evil.example', 'x-forwarded-proto': 'https' }) }).ok).toBe(false);
//   // today: ok: true
```
