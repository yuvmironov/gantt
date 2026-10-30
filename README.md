# SMART OATI

Серверная версия планировщика SMART OATI.

Репозиторий находится в стадии bootstrap: контракты, инфраструктурный каркас и CI уже подготовлены, приложения сервисов будут добавляться следующими этапами.

## Требования

- Node.js 22 LTS;
- pnpm 10 через Corepack;
- Docker Desktop/Engine + Compose v2;
- mkcert;
- Helm 3.16+ или Helm 4.x и kubectl — для Kubernetes. Chart проверен на Helm 4.3.1.

## Быстрый старт

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install
pnpm test
```

Локальная инфраструктура:

```bash
cp infrastructure/local/.env.example infrastructure/local/.env.local
docker compose --env-file infrastructure/local/.env.local --profile infra --profile apps -f infrastructure/local/docker-compose.yml up -d --build
```

HTTPS-сертификаты:

```bash
cd infrastructure/local
mkcert -install
mkcert -cert-file certs/local.pem -key-file certs/local-key.pem "*.localhost" localhost 127.0.0.1 ::1
```

## Команды

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm test:unit
pnpm test:contract
pnpm build
pnpm start:api-gateway
pnpm start:user-service
pnpm start:project-service
```

## Структура

```text
apps/api-gateway/      # HTTP API Gateway + REST auth proxy + health/config/errors
apps/user-service/     # User & Access: auth, sessions, HTTP health + gRPC
apps/project-service/  # Project/Diagram: HTTP health + gRPC contract
packages/service-kit/  # общий каркас Fastify/gRPC-сервисов
packages/shared/       # общие утилиты
contracts/             # REST/gRPC mapping, import/export
proto/                 # protobuf-контракты
openapi/               # OpenAPI
events/                # события
notifications/         # шаблоны и схемы
db/                    # миграции и seed
infrastructure/local/  # Docker Compose
infrastructure/helm/   # Helm-каркас
tools/                 # проверки контрактов
```

## Документация

В этом репозитории находятся код, контракты и инженерные артефакты. Продуктовые постановки, P0-пакет, ADR и visual design ведутся в отдельном рабочем каталоге проекта. При необходимости их можно добавить в `docs/`.

## Статус

- [x] Контракты OpenAPI/proto/events.
- [x] DDL, seed, import/export.
- [x] P0-документы и ADR подготовлены.
- [x] Базовый CI и проверки контрактов.
- [x] Docker Compose для инфраструктуры.
- [x] Helm service template.
- [x] API Gateway skeleton + Dockerfile.
- [x] API Gateway Compose profile + Helm chart.
- [x] API Gateway REST auth proxy.
- [x] User & Access: auth, sessions, HTTP health + gRPC.
- [x] Project / Diagram: lifecycle + direction edit/reorder/responsible + tasks/assignments/move + dependency edit + task detail/edit/progress/delete + comments + holidays + Gantt snapshot + JSON/CSV export.
- [ ] Остальные сервисы.
- [ ] Staging/prod Helm values.
- [ ] E2E и load tests.
