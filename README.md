# SMART OATI

Планировщик SMART OATI: API Gateway, User & Access, Project / Diagram, Notification, Audit, Sync и Nuxt web-интерфейс для локального запуска.

## Требования

Для локального запуска достаточно Docker Desktop/Engine + Compose v2.

Для разработки и тестов:

- Node.js 22 LTS;
- pnpm 10 через Corepack;
- Helm 3.16+ или Helm 4.x и kubectl — для Kubernetes. Chart проверен на Helm 4.3.1.

## Первый локальный запуск

```bash
cp infrastructure/local/.env.example infrastructure/local/.env.local
docker compose --env-file infrastructure/local/.env.local -f infrastructure/local/docker-compose.yml --profile infra --profile apps up -d --build
```

При первом запуске автоматически:

- создаются базы данных;
- применяются миграции и seed;
- создаётся development-администратор;
- Traefik отдаёт локальный самоподписанный сертификат.

Открыть приложение: **https://app.localhost**

Данные администратора по умолчанию:

```text
admin@smart-oati.local
ChangeMeDevOnly!
```

Проверка:

```bash
docker compose --env-file infrastructure/local/.env.local -f infrastructure/local/docker-compose.yml --profile infra --profile apps ps
curl -k https://app.localhost/health
curl -k https://app.localhost/api/v1/health
```

Повторный запуск после `down` не требует ручных миграций — `db-init` идемпотентен.

Остановка:

```bash
docker compose --env-file infrastructure/local/.env.local -f infrastructure/local/docker-compose.yml --profile infra --profile apps down
```

Удаление данных:

```bash
docker compose --env-file infrastructure/local/.env.local -f infrastructure/local/docker-compose.yml --profile infra --profile apps down -v
```

## Участники, приглашения и пароли

- Кнопка **Участники** в выбранном проекте: добавление существующего пользователя, приглашение по email, смена роли и удаление.
- Новые приглашения и письма для сброса пароля приходят в Mailpit: **https://mail.localhost**.
- Ссылка сброса открывает форму нового пароля; смена пароля доступна в верхнем меню.
- Уведомления и Gantt обновляются в реальном времени через `sync-service`.

## Локальные команды

```bash
pnpm local:up       # запуск infra + apps
pnpm local:status   # состояние контейнеров
pnpm local:health   # проверка app, sync и Mailpit
pnpm local:demo     # демо-пользователи, проект, диаграмма и задачи (demo.owner@smart-oati.local / DemoPassword123!)
pnpm local:logs     # логи
pnpm local:down     # остановка
pnpm local:reset    # остановка с удалением volumes
pnpm local:backup   # дамп всех БД в backups/
pnpm local:restore -- backups/<file>.sql
pnpm local:verify-restore  # restore-drill в отдельном контейнере
```

## HTTPS

Traefik использует собственный самоподписанный сертификат. Браузер покажет предупреждение — для local его нужно принять один раз.

Доверенный сертификат можно подключить позже через `tls.certificates` в `infrastructure/local/traefik/dynamic.yml`.

## Адреса

- `app.localhost` — Nuxt web-интерфейс;
- `api.localhost` — API Gateway;
- `mail.localhost` — Mailpit UI;
- `kafka.localhost` — Kafka UI;
- `sync.localhost` — Sync Service WebSocket;
- `notify.localhost` — Notification Service WebSocket.

## Команды разработки

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm test:unit
pnpm test:contract
pnpm test:e2e
pnpm build
pnpm start:api-gateway
pnpm start:user-service
pnpm start:project-service
```

`pnpm test:e2e` использует Playwright и Chrome, поэтому требует запущенный локальный стек.

## Структура

```text
apps/api-gateway/      # HTTP API Gateway, REST API, health/config/errors
apps/user-service/     # User & Access: auth, sessions, HTTP health + gRPC
apps/project-service/  # Project/Diagram: HTTP health + gRPC
apps/frontend/         # Nuxt SPA + same-origin proxy к API
apps/web/              # legacy static UI; Compose его не запускает
apps/notification-service/ # уведомления, Email/Telegram delivery, preferences
apps/audit-service/    # аудит и privileged events
apps/sync-service/     # WebSocket-синхронизация Gantt
packages/service-kit/  # общий каркас Fastify/gRPC-сервисов
packages/shared/       # общие утилиты
contracts/             # REST/gRPC mapping, import/export
proto/                 # protobuf-контракты
openapi/               # OpenAPI
events/                # события
notifications/         # шаблоны и схемы
db/                    # миграции и seed
infrastructure/local/  # Docker Compose, db-init
infrastructure/helm/   # Helm charts + staging/prod values
tools/                 # проверки контрактов
```

## Документация

Актуальная техническая документация — README сервисов, `openapi/`, `proto/` и `events/`. Продуктовые постановки, P0-пакет, ADR и visual design ведутся в отдельном рабочем каталоге проекта; при необходимости их можно добавить в `docs/`.

## Статус

- [x] Контракты OpenAPI/proto/events.
- [x] DDL, seed, diagram export.
- [x] P0-документы и ADR подготовлены.
- [x] Базовый CI и проверки контрактов.
- [x] Docker Compose для инфраструктуры и приложений.
- [x] Автоматические миграции, seed и development-admin.
- [x] Helm service template и API Gateway chart.
- [x] API Gateway REST auth proxy.
- [x] User & Access: auth, sessions, HTTP health + gRPC.
- [x] Project / Diagram: lifecycle + directions + tasks + assignments + dependencies + comments + holidays + JSON/CSV export/import. Разрешены direction→direction и task→direction; direction→task запрещён на API и в БД.
- [x] Web-интерфейс: вход, проекты, диаграммы, Gantt, модалки задачи/направления/связей/календаря/импорта, назначения, комментарии, перемещение, фильтры, сессии, экспорт, toast-уведомления.
- [x] Nuxt SPA is the primary interface; legacy static UI is no longer served.
- [x] Componentized Nuxt pages: /projects, /projects/:id, /gantt, /login, /admin, /profile, /notifications and /members.
- [x] Vue Gantt: task/direction CRUD, assignments, progress, comments, dependencies с правилами типов и стилями, calendar, import/export, realtime, drag-and-drop, project/diagram/direction creation, weekend shading, toast-уведомления, расчёт окончания задачи по часам (8 ч/день).
- [x] Notification, Audit, Sync services.
- [x] Helm charts for services and staging/prod umbrella values.
- [x] Playwright E2E: auth, admin roles, Gantt, dependency rules/link mode, bar drag, task hours, import, members, notifications, profile and password reset.
- [x] Security headers, CSP, API rate limiting and auth audit events.
- [x] Project members, invitations, password reset/change and resend verification.
- [x] Global admin roles: создание администратора и повышение существующего пользователя.
- [x] Real-time Gantt synchronization through `sync-service`.
- [x] Multi-user Playwright E2E with invitation and real-time updates.
- [x] Project-scoped real-time sync tokens and authenticated WebSocket.
- [x] Email/Telegram delivery worker, notification preferences and Telegram linking.
- [x] Session restore, profile editing and local admin user creation.
- [x] Executor CRUD, user linking, admin user roles, blocking and user lifecycle.
- [x] Load tests (k6 smoke: 10 VUs, 20s, p95 43 ms, 0 errors).
- [x] Prometheus metrics, local Grafana dashboards and alerts.
- [x] System settings UI, audit filters and authenticated k6 scenario.
- [ ] Production staging deploy and real-cluster verification.

## Observability

All Fastify services expose Prometheus metrics at `/metrics`: request count, request duration, process metrics and the service target status. Helm pods carry `prometheus.io/*` scrape annotations.

`sync-service` additionally exposes `sync_ws_connections_active`, `sync_ws_auth_failures_total` and `sync_events_sent_total`. Sync tokens are signed with `SYNC_TOKEN_SECRET`; local Compose defaults to a development value, Kubernetes expects a `smart-oati-sync` Secret with key `token`.

Local monitoring:

```bash
docker compose --env-file infrastructure/local/.env.local -f infrastructure/local/docker-compose.yml --profile monitoring up -d prometheus grafana
```

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (`admin` / `admin` locally)
- Alert rules: `infrastructure/local/monitoring/alerts.yml`
- Dashboard: `infrastructure/local/monitoring/grafana/dashboards/smart-oati.json`
