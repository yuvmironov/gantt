# SMART OATI

Планировщик SMART OATI: API Gateway, User & Access, Project / Diagram и минимальный web-интерфейс для локального запуска.

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

## HTTPS

Traefik использует собственный самоподписанный сертификат. Браузер покажет предупреждение — для local его нужно принять один раз.

Доверенный сертификат можно подключить позже через `tls.certificates` в `infrastructure/local/traefik/dynamic.yml`.

## Адреса

- `app.localhost` — web-интерфейс;
- `api.localhost` — API Gateway;
- `mail.localhost` — Mailpit UI;
- `kafka.localhost` — Kafka UI;
- `sync.localhost`, `notify.localhost` — зарезервированы под следующие сервисы.

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
apps/api-gateway/      # HTTP API Gateway + REST auth proxy + health/config/errors
apps/user-service/     # User & Access: auth, sessions, HTTP health + gRPC
apps/project-service/  # Project/Diagram: HTTP health + gRPC
apps/web/              # минимальный web-интерфейс + same-origin proxy к API
packages/service-kit/  # общий каркас Fastify/gRPC-сервисов
packages/shared/       # общие утилиты
contracts/             # REST/gRPC mapping, import/export
proto/                 # protobuf-контракты
openapi/               # OpenAPI
events/                # события
notifications/         # шаблоны и схемы
db/                    # миграции и seed
infrastructure/local/  # Docker Compose, db-init
infrastructure/helm/   # Helm-каркас
tools/                 # проверки контрактов
```

## Документация

В репозитории находятся код, контракты и инженерные артефакты. Продуктовые постановки, P0-пакет, ADR и visual design ведутся в отдельном рабочем каталоге проекта. При необходимости их можно добавить в `docs/`.

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
- [x] Project / Diagram: lifecycle + directions + tasks + assignments + dependencies + comments + holidays + export.
- [x] Web-интерфейс MVP: вход, проекты, диаграммы, Gantt, карточка задачи, назначения, комментарии, зависимости, праздники, перемещение, фильтры, сессии, экспорт.
- [ ] Полноценный Nuxt frontend по visual design.
- [ ] Импорт диаграмм.
- [ ] Notification, Audit, Sync services.
- [ ] Staging/prod Helm values.
- [x] Playwright smoke E2E.
- [ ] Load tests.
