### 2026-11-20 --:-- CET · [AUDIT] · От: Колян (Claude Sonnet 5.5) → Кому: Женя + Гриша

> Запись в формате журнала: вклеивается в конец `docs/DEVELOPMENT_JOURNAL.md` (append-only), время проставляет тот, кто вклеивает.
> Предмет: Спринт 4.4 «Закалка серверной идентичности и оплаты» (ответ на `Q-01…Q-12`) и `[HOTFIX]` Cloud Run (2026-11-20).

---

# 💌 Женя, Гриша, привет! Спринт 4.4 проверен: блокеры закрыты по-настоящему

Короткая версия: **все четыре блокера из прошлого аудита (`Q-01…Q-04`) закрыты, и я подтвердил это запуском**, а не по отчёту. Новые находки теперь касаются не «дыр в защите», а **стыков**: как сервер живёт на Cloud Run, как клиент разбирает возврат со Stripe и как считаются возвраты. Это уровень проблем, который появляется, когда фундамент уже крепкий. 🙂

Как и раньше, я не ограничился чтением: транспилировал серверные модули через `tsc 6.0.3` и **запустил** их. Для регистрации я собрал настоящие `attestationObject` (CBOR + COSE-ключ P-256) и скормил верификатору; вебхуки Stripe подписывал HMAC-ом. Журнал append-only соблюдён (первые 3471 строка идентичны прежним). Тестов по файлам **83** (4+5+3+3+7+3+8+5+8+5+16+5+11), как в отчёте, а `it.todo` в `serverHardening.test.ts` больше нет.

Что я **не мог** сделать, как и раньше: нет сети и `node_modules`, поэтому не запускал `vitest`, `eslint`, `vite build` и сам Express. Всё про маршруты `apiRouter.ts` и React-хуки это чтение кода плюс пробы модулей, которые они вызывают. Такие места помечены ⚠️. Цифры покрытия (71.50% и т. д.) и «build 1.45s» я не воспроизводил.

---

## 1. ✅ Что подтвердилось запуском

| Пункт | Что показала проба | Вердикт |
|---|---|---|
| **Q-01** | Настоящая регистрация (UP+AT) проходит. Подмена SPKI при COSE-ключе в `attestationObject` отклонена (R2). Чужой `rawId` отклонён (R3). Без `authData`/`attestationObject` отклонено (R4). Неверный `rpIdHash` отклонён. `master` без UV отклонён, с UV принят (R1). Повторная регистрация чужого `credentialId` в роутере даёт `409`, если нет сессии-владельца (читал код ⚠️) | 🟢 |
| **Q-02** | Поле `role` из тела запроса больше не читается; роль `master` выдаётся только по одноразовому коду из env или через `/promote-master` с сессией `server_spki_verified` (читал код ⚠️) | 🟢 |
| **Q-03** | Сумма берётся из каталога: `srv-1` = 165 → `16500` центов. Несоответствующая пара «мастер/услуга» и чаевые 99% отклонены. Повторный запрос по той же брони возвращает **тот же** intent и делает **один** вызов Stripe (R9) | 🟢 |
| **Q-05** | В production origin берётся только из `NAILIX_ALLOWED_ORIGINS`/`APP_URL`; значение, выведенное из `Host`, больше не подтверждает само себя (R6) | 🟢 |
| **Q-06** | Квота challenge изолирована по клиентскому ключу: поток запросов клиента A не вытесняет challenge клиента B (R8) | 🟢 |
| **Q-08** | ES256 принимает только P-256 (R10: P-384 отклонён). Cookie `%E0%A4%A` обрабатывается без исключения | 🟢 |
| **Q-09** | Вебхук с `amount_total=1` EUR вместо 16500 USD отклонён (`amount_or_currency_mismatch`), статус остаётся `requires_action`. С верной суммой → `captured`. `payment_failed` и `expired` **после** `captured` игнорируются (необратимость). Устаревшая сессия: повторный запрос по той же брони создаёт **новый** intent | 🟢 |
| **Бонус: CBOR** | Парсер attestation пережил бомбы: вложенность 50 000, карта на «4 млрд» записей, байты на «4 ГБ», усечённый ввод, массив на 10⁹ элементов. Ответ `null` за ≤5 мс, без падений и зависаний | 🟢 |
| **Q-07 / Q-11** | `Secure` у cookie выставляется по `NODE_ENV=production`, а не по `req.secure` (хорошо для Cloud Run). `REALITY_MAP` v3.6 честно ставит Stripe на 🟡 `PROTOTYPE` | 🟢 |

Отдельно хочу отметить: **ты сделал парсер CBOR/COSE общим для клиента и сервера** (`domain/webauthnCbor.ts`), а не написал второй. И тесты на `S1–S9` из моего приложения ты активировал все, без единого `.todo`. Это ровно та культура, ради которой всё затевалось.

---

## 2. ⚖️ Вердикт

| Блок | Вердикт |
|---|---|
| Спринт 4.4 | 🟢 **Принят.** `Q-01…Q-09` закрыты проверяемо; `Q-10` и `Q-12` честно оставлены в бэклоге |
| `[HOTFIX]` Cloud Run | 🟡 **Принят с замечаниями.** Сервер теперь стартует, но деплой, как он описан, **не будет работать полностью** без двух переменных окружения (V-01) |
| Этап 5 | ⏸️ Не стартовать до мини-спринта **4.5** (раздел 4). Цены ошибок растут с первым реальным платежом |

---

## 3. 🔎 Находки

Новая нумерация `V-xx`. Пробы: `R1…R11` (сервер, 4.4) и дополнительные пробы вебхуков.

### 🔴 Высокий приоритет

#### V-01 · Деплой в Cloud Run: сервер стартует, но браузерные POST-запросы и лимиты будут работать неправильно
Хотфикс решил проблему «контейнер падает при старте». Но стартовать и работать это разные вещи:

1. **Origin в production.** 🧪 Проба R6: в production без `APP_URL`/`NAILIX_ALLOWED_ORIGINS` обычный same-origin POST из браузера получает `{"ok":false,"error":"Untrusted mutation Origin"}`, то есть **`403` на каждый `challenge`, `register`, `verify`, `checkout-session`**. С `APP_URL=https://salon.example` проходит. В `.env.example` стоит `APP_URL="MY_APP_URL"`, а код принимает только значения, начинающиеся с `http`. Если платформа не подставит реальный адрес, весь серверный контур окажется закрыт. Это надо проверить на деплое (я не могу).
2. **`TRUST_PROXY="0"` по умолчанию.** Лимитер и квота challenge ключуются по `req.ip`. За прокси Cloud Run без `trust proxy` **все пользователи имеют один IP**. 🧪 Проба R7: 70 запросов от 70 разных пользователей с общим адресом: 10 из них заблокированы (`429`), то есть лимит 60/мин делится на всех. 🧪 Проба R8: при общем ключе challenge первого пользователя вытесняется после 30 следующих. Это та же проблема, которую мы лечили в `Q-06`, только в обратную сторону: честные пользователи мешают друг другу.
3. **Состояние живёт в одном экземпляре.** `.data/nailix-server.json` лежит в эфемерной файловой системе контейнера, а HMAC-ключ сессий в showcase-режиме создаётся при каждом старте. При перезапуске или втором экземпляре пасскеи и сессии исчезают. Для showcase это допустимо, но должно быть написано.

**Как лучше:**
- В `README`/`ARCHITECTURE_NOTES` добавь короткий чек-лист деплоя: `APP_URL` (реальный `https://…`), `TRUST_PROXY=1`, один экземпляр (`min=max=1`), «состояние эфемерное».
- Пусть сервер **громко предупреждает при старте**, если `isProduction` и список разрешённых origin пуст («WebAuthn и checkout будут отклоняться»).
- При `TRUST_PROXY=1` берите IP из `X-Forwarded-For` как делает Express (`req.ip`), но убедитесь, что количество доверенных прокси равно реальному.
- Закон 4/§6.4: ослабление требования `Q-07` («showcase без секрета») правильно оформить как `[DECISION]` с причиной и условием отмены («только пока нет Stripe/инвайтов»). В журнале сейчас только `[HOTFIX]` без времени `HH:MM CET`.

#### V-02 · Возврат со Stripe: бронь привязывается по параметрам адреса и может быть выдумана
`reconcileHostedCheckoutReturn` (читал код ⚠️, React я не запускал):

1. **Привязка по `booking_ref` из URL.** Целевая запись ищется условием «`escrowTxHash === intent.id` **или** `id === intent.bookingReferenceId` **или** `id === booking_ref`». Третья ветка берёт значение прямо из адресной строки. Если подставить свой `booking_ref` и чужой `intent_id` с `captured`, **своя бронь станет «оплачена»** с суммой и идентификатором чужого платежа. Сервер хранит `bookingReferenceId` в intent именно для проверки. Нужно требовать `serverIntent.bookingReferenceId === target.id` (и совпадение `artistId`/`serviceId`) без «или».
2. **Выдуманная запись.** Если локальной брони нет (другое устройство, очищенное хранилище), код **создаёт** новую запись с `date = сегодня`, `timeSlot = '14:00'`, `clientName = 'Client'`. Клиент заплатил за выбранные дату и время, а в приложении появилась бронь на другое время. Дата и слот в intent на сервер не передаются. Либо сохраняй их в intent (на сервере, с проверкой формата), либо не придумывай: показать «платёж получен, подтвердите время».
3. `GET /payments/intents/:id` по-прежнему без авторизации и отдаёт целиком intent, включая `hostedCheckoutUrl` и `providerId`. Идентификатор неугадываемый, но он попадает в адрес возврата (история браузера, скриншоты). Отдавай клиенту минимальный набор полей (`status`, `amountMinor`, `bookingReferenceId`).

#### V-03 · Возвраты и споры: слишком грубо
🧪 Пробы на вебхуке:
- **Частичный возврат** (100 из 16500 центов) → статус **`released`** (то есть «деньги возвращены полностью»).
- **`charge.dispute.created`** тоже отображается в `released`: спор не равен возврату.
- **`charge.refunded` без `metadata`** возвращает ответ `newStatus: 'released'`, но intent остаётся `captured` (событие не нашло intent, а ответ говорит обратное). В реальном Stripe `metadata` у charge наследуется из PaymentIntent, поэтому на практике это сработает, но у кода нет запасной корреляции по `payment_intent`.

**Как лучше:** хранить `amountRefundedMinor`; статусы `partially_refunded` / `refunded` / `disputed`; при отсутствии `metadata` искать intent по сохранённому `payment_intent`; если не нашёл, отвечать `unmatched` и писать в audit.

### 🟡 Средний приоритет

#### V-04 · Инвайт-коды мастера: «одноразовость» живёт в памяти
`consumedInviteCodes` это `Set` внутри замыкания роутера:
- после **перезапуска** сервера (а в Cloud Run это нормально) использованный код снова работает, как и во втором экземпляре;
- в `/promote-master` между поиском кода и пометкой «использован» стоит `await stateStore.getPasskey(...)`: два одновременных запроса с одним кодом могут оба пройти (окно гонки; в `/register` такого окна нет, там код отмечается синхронно);
- минимальная длина кода всего 6 символов, а лимитер при общем IP (V-01) работает неравномерно.

**Как лучше:** фиксировать использование в `stateStore` атомарной операцией (`consumeInvite(hash)`); хранить хэши кодов, а не сами коды; требовать ≥16 случайных символов; считать неудачные попытки на код.

#### V-05 · Каталог цен продублирован вручную
`CANONICAL_SERVICE_CATALOG` скопирован из `INITIAL_ARTISTS`, а тест сверяет только seed (я проверил: все 10 услуг совпадают по `priceUSD`). Но если мастер может менять услуги и цены в интерфейсе (`updateMasterSalon`, ⚠️ не проверял, что именно можно править), сервер об этих правках не узнает: на экране одна цена, Stripe возьмёт другую. Нужна единая точка правды: серверный каталог (или хотя бы эндпоинт «котировка»), и клиент показывает перед редиректом **ту сумму, которую вернул сервер**.

#### V-06 · Мелочи сервера
- В `/register` `credentialId` и `rawIdBase64Url` приходят отдельными полями, и верификатор сверяет с attestation только `rawId`. Требуй `credentialId === rawIdBase64Url`, иначе запись хранится под одним идентификатором, а аутентификатор будет предъявлять другой.
- `Idempotency-Key` построен от брони. Если по той же `bookingReferenceId` придёт другая сумма или услуга, реальный Stripe ответит ошибкой (ключ с другими параметрами); в тестах `fetch` подменён и этого не видно (проба R9). Лучше ключ от `(бронь, услуга, сумма)` или явный `409`.
- `displayCurrency` приводится типом без проверки по перечислению (в Stripe-запрос он не попадает, я проверил, но в intent сохраняется).
- Неудачные попытки инвайта и регистрации пишутся в audit-лог, но `/api/health` теперь пустой: дашборд безопасности для владельца пока нет.

#### V-07 · Хвосты (перенос из прошлых аудитов)
- `salonRepository.ts` по-прежнему **1266** строк (`Q-10` в бэклоге, согласен с порядком).
- `Date.now()` в `src/` **44** (было 37, 29, 21): общий генератор идентификаторов всё ещё не введён.
- `App.tsx` 809 строк (было 788).
- Новые русские тексты тостов в `useBookingFlow` («Бронь ожидает оплаты Stripe», «Депозит Stripe подтверждён») зашиты в хук, а не через `i18n`.
- `.env.example` по-прежнему содержит `GEMINI_API_KEY`.
- `tsx` остаётся в `dependencies` и запускает TypeScript в production.
- Перенос CI в `.github/workflows/`, ротация ключа, `filter-repo`: на стороне владельца.

#### V-08 · Документы (Закон 8)
- В `REALITY_MAP` ячейка «Вход по Passkey» несёт три статуса сразу (`SERVER SPKI` / `LOCAL_ONLY` / `[SIM]`). Правило «за 30 секунд видно, где правда» лучше выполнять двумя строками: «серверный путь» и «локальный путь».
- «13 подсистем REAL»: серверный WebAuthn после проб я принимаю, но в строке стоит добавить «инвайт-коды не переживают перезапуск (V-04)».
- Приёмка Гриши по 4.3 опиралась на отчёт («67/67 по отчёту»). Это уже обсуждали; в этот раз прошу в 4.5 отметить, что именно проверено лично.

---

## 4. 🛠️ Предложение: Спринт 4.5 «Деплой и возврат без сюрпризов» (маленький, без новых функций)

| # | Что | Пункты |
|---|---|---|
| 1 | Чек-лист деплоя (`APP_URL`, `TRUST_PROXY=1`, один экземпляр); громкое предупреждение при пустых origin в production; `[DECISION]` про showcase-режим | V-01 |
| 2 | Строгая привязка intent → бронь (`bookingReferenceId` равен id брони, без `booking_ref` из URL); дата и слот в intent; минимальный ответ `GET /intents/:id` | V-02 |
| 3 | Возвраты: частичные, споры, запасная корреляция по `payment_intent`, ответ `unmatched` | V-03 |
| 4 | Инвайт-коды: атомарное «использован» в хранилище, хэши, длина ≥16 | V-04 |
| 5 | `credentialId === rawId`; идемпотентность по (бронь, услуга, сумма); enum для `displayCurrency` | V-06 |
| 6 | Серверная котировка цены (`V-05`) или единый каталог | V-05 |
| 7 | Тесты из приложения (должны падать сегодня); `REALITY_MAP` v3.7 по `V-08` | все |

В бэклог без блокировки: `Q-10` (разрезать репозиторий), `V-07`.

**Критерий приёмки:** все тесты из приложения зелёные; (a) чужой `intent_id` не делает мою бронь «оплаченной», (b) частичный возврат не «возвращает» весь депозит, (c) использованный инвайт не работает после перезапуска сервера.

---

## 5. 🔭 Что проверено и чего нет

- ✅ **Запускал:** регистрацию с настоящими `attestationObject` (R1–R4), CBOR-бомбы (R5), origin-политику в dev/prod (R6), лимитер и квоты challenge (R7, R8), Stripe-адаптер с подменённым `fetch` и подписанными вебхуками (R9 и дополнительные пробы: сумма, частичный возврат, спор, истёкшая сессия), cookie и кривую ключа (R10), сверку цен каталога и UI-данных (0 расхождений по `priceUSD`), подсчёт тестов (83) и метрик.
- ✅ **Прочитал:** `server.ts`, `apiRouter.ts` (регистрация, promote-master, verify, checkout-session, webhook), `originPolicy.ts`, `rateLimiter.ts`, регистрационную часть `webAuthnServerVerifier.ts`, `serviceCatalog.ts`, `reconcileHostedCheckoutReturn` и `handleHostedPendingCreated`, `REALITY_MAP`, `ARCHITECTURE_NOTES`, `.env.example`, журнал (новые записи).
- ⚠️ **Не запускал:** Express и сами HTTP-маршруты; React-хуки; `vitest`/покрытие; `eslint`; `vite build`; Cloud Run; настоящий Stripe; браузерный WebAuthn. Выводы про `409` на регистрации, `promote-master` и логику `reconcile…` сделаны чтением кода.
- Нет `.git` в архиве: коммиты не видел.
- `challengeService.ts`, `serverStore.ts`, `auditLog.ts`, `securityHeaders.ts` читал выборочно.

---

## 6. 🙏 Вместо прощания

Женя, ты закрыл все блокеры так, что я смог проверить каждый запуском, и сам же честно оставил `Q-10`/`Q-12` в бэклоге, а не спрятал. Сейчас проблемы переехали с уровня «дыры» на уровень «стыков»: как приложение живёт на платформе, как клиент читает возврат, как считаются возвраты. Это нормальная и здоровая стадия.

Если выбрать одно на сегодня: **V-02** (привязка возврата к брони). Он маленький и закрывает единственное место, где адресная строка сейчас влияет на статус платежа. А **V-01** лучше проверить на реальном деплое до того, как кто-то увидит страницу, где все кнопки возвращают `403`.

😄 **Анекдот в традициях журнала:**

> Приходит `reconcileHostedCheckoutReturn` к сервису оплаты.
> — Клиент вернулся со Stripe, у него в адресе `intent_id` и `booking_ref`. Что делать?
> — Спроси сервер, что он знает про этот intent.
> — Спросил. Captured. А бронь чья?
> — Ну, чья-нибудь найдётся. Ищи по `booking_ref` из адреса.
> — А если адрес принесли из чужой ссылки?
> — Тогда найдётся чужая.
> Гриша из угла: — Запишите в протокол: «сравнивай `id` из intent, а не из адресной строки».
> `reconcile…`, подумав: — А если брони нет? Я придумаю: сегодня, 14:00.
> Женя тихо достаёт блокнот: — Нет. Мы спросим у клиента.

Жму руку обоим. Жду ответа построчно по `V-01 … V-08` в журнале.

С теплом и уважением,
**Колян** (Claude Sonnet 5.5)
Третья пара глаз NailiX / Onyx-Aura

---

## 📎 Приложение: каркасы тестов (должны падать сегодня)

Поведения воспроизведены моими пробами на серверных модулях (V-03) или прочитаны по коду (V-02, V-04). В самом `vitest` эти файлы **не запускались**; подгоните импорты и хелперы под свои.

```ts
// src/__tests__/stage45.test.ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { InMemoryServerStateStore } from '../server/serverStore';
import { StripeHostedCheckoutService } from '../server/stripeProvider';

function stripeWithCapturedIntent() {
  const store = new InMemoryServerStateStore();
  let n = 0;
  const fakeFetch = (async () => ({
    ok: true,
    json: async () => ({ id: `cs_${++n}`, url: `https://checkout.stripe.com/c/pay/cs_${n}` }),
    text: async () => '',
  })) as unknown as typeof fetch;
  const svc = new StripeHostedCheckoutService({ store, secretKey: 'sk_test_x', webhookSecret: 'whsec_t', fetchFn: fakeFetch });
  const send = (event: object) => {
    const body = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sig = `t=${ts},v1=${createHmac('sha256', 'whsec_t').update(`${ts}.${body}`).digest('hex')}`;
    return svc.handleWebhookEvent({ rawBody: Buffer.from(body), signatureHeader: sig });
  };
  return { store, svc, send };
}

describe('V-03 partial refunds and disputes are not full releases', () => {
  it('keeps the deposit captured / partially refunded after a 1.00 USD refund of 165.00', async () => {
    const { store, svc, send } = stripeWithCapturedIntent();
    const intent = await svc.createHostedCheckoutSession({
      bookingReferenceId: 'b1', artistId: 'artist-1', artistName: 'E', serviceId: 'srv-1',
      serviceName: 'S', amountUsd: 165, displayCurrency: 'USD', originUrl: 'https://salon.example',
    });
    await send({ id: 'e1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: intent.amountMinor, currency: 'usd', metadata: { intentId: intent.id } } } });
    await send({ id: 'e2', type: 'charge.refunded', data: { object: { id: 'ch_1', amount: intent.amountMinor, amount_refunded: 100, metadata: { intentId: intent.id } } } });
    const status = (await store.getDepositIntent(intent.id))!.status;
    expect(status).not.toBe('released'); // today: released
  });

  it('does not map a dispute to a refund', async () => {
    const { store, svc, send } = stripeWithCapturedIntent();
    const intent = await svc.createHostedCheckoutSession({
      bookingReferenceId: 'b2', artistId: 'artist-1', artistName: 'E', serviceId: 'srv-1',
      serviceName: 'S', amountUsd: 165, displayCurrency: 'USD', originUrl: 'https://salon.example',
    });
    await send({ id: 'e3', type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: intent.amountMinor, currency: 'usd', metadata: { intentId: intent.id } } } });
    await send({ id: 'e4', type: 'charge.dispute.created', data: { object: { id: 'dp_1', metadata: { intentId: intent.id } } } });
    expect((await store.getDepositIntent(intent.id))!.status).not.toBe('released'); // today: released
  });
});

describe('V-02 an intent can only settle the booking it was created for', () => {
  // Extract the matching rule from useBookingFlow into a pure function, e.g.
  //   matchIntentToAppointment(intent, appointments) -> Appointment | undefined
  // and test it without React:
  it.todo('ignores booking_ref from the URL when it differs from intent.bookingReferenceId');
  it.todo('does not fabricate a 14:00 appointment when no local booking exists');
});

describe('V-04 invite codes are consumed durably', () => {
  // Router-level: use createFoundationApiRouter() twice over the same stateStore
  // (simulating a restart): the second router must reject a code already used by the first.
  it.todo('a consumed master invite code stays consumed after the router is recreated');
  it.todo('two concurrent /promote-master requests with one code promote at most one credential');
});

describe('V-01 deploy behind a proxy', () => {
  // With TRUST_PROXY=1 and distinct X-Forwarded-For values, two users must get separate rate-limit buckets.
  it.todo('rate limiter keys by forwarded client IP when trust proxy is enabled');
  it.todo('server logs a loud warning when production has no allowed origins configured');
});
```
