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
docker compose --env-file infrastructure/local/.env.local --profile infra -f infrastructure/local/docker-compose.yml up -d
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
```

## Структура

```text
apps/                  # приложения сервисов (следующий этап)
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

- `../Системные постановки/P0/README.md` — P0-пакет.
- `../Системные постановки/UI_UX_Visual_Design_SMART_OATI.md` — visual design.
- `../SMART_OATI_план_реализации_серверных_интеграций.md` — план.

## Статус

- [x] Контракты OpenAPI/proto/events.
- [x] DDL, seed, import/export.
- [x] P0-документы и ADR.
- [x] Базовый CI и проверки контрактов.
- [x] Docker Compose для инфраструктуры.
- [x] Helm service template.
- [ ] Приложения API Gateway и сервисов.
- [ ] Dockerfile приложений.
- [ ] Staging/prod Helm values.
- [ ] E2E и load tests.
