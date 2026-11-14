# Кикер Пикер (Kicker Picker)

Telegram Mini App и бот на платформе **Telegram Serverless (`tgcloud`)** для организации и проведения турниров по настольному футболу без сторонних платных серверов и БД.

## Архитектура

- **Backend (`tgcloud/`)** — модули для V8-изолята Telegram Serverless и встроенной SQLite БД:
  - [tgcloud/schema.js](tgcloud/schema.js) — декларация таблиц и индексов (`users`, `tournaments`, `tournament_players`, `tournament_admins`, `matches`, `club_players`, `client_errors`);
  - [tgcloud/lib/dyp.js](tgcloud/lib/dyp.js) — чистые алгоритмы жеребьёвки (`Monster DYP`, `Classic DYP`, `Random DYP`, `Swiss`, `Round Robin`, `Whist`, `Last One Standing`, `Elimination`), плей-офф до `Top-32`, тай-брейки (`BH₁`, `ØBH`, `SB`) и тайминги;
  - [tgcloud/lib/helpers.js](tgcloud/lib/helpers.js) — хелперы БД с CAS-защитой (`UPDATE ... WHERE ... RETURNING`), уведомлениями, напоминаниями о долгих матчах и глобальным профилем игрока;
  - [tgcloud/lib/publicLive.js](tgcloud/lib/publicLive.js) — публикация публичной live-ленты (`textdb.dev` с автоматическим fallback на `telegra.ph`);
  - [tgcloud/endpoints/](tgcloud/endpoints) — серверные функции Mini App (`POST /api/<name>`), включая лёгкий polling `getState({ light: true })` и дедуплицированный сбор ошибок `reportClientError`;
  - [tgcloud/handlers/](tgcloud/handlers) — обработчики апдейтов бота (`message`, `callback_query`).
- **Frontend (`src/`)** — React 19 + TypeScript + Tailwind CSS v4 + Vite (с ленивой загрузкой редких экранов и PNG-экспортеров).
- **Tests (`tests/`)** — Vitest + JSDOM + интеграционные тесты на реальном `node:sqlite` (`:memory:`).

## Команды разработки

```bash
npm install
npm run typecheck    # Проверка типов фронтенда (TS) и бэкенда (checkJs)
npm test             # Прогон всех unit, SQLite-интеграционных и UI-тестов
npm run build        # Продакшен-сборка Mini App в dist/
```

## Деплой и миграция в Telegram Serverless

```bash
npx tgcloud status
npm run deploy          # npm run build && tgcloud push
npx tgcloud migrate --dry-run
npx tgcloud migrate --yes
npx tgcloud webhook sync
```
