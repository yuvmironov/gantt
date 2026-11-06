# Локальная инфраструктура RP Gant

Поднимает PostgreSQL, Redis, Kafka, Kafka UI, Mailpit, mock Telegram, Traefik, API Gateway, User & Access, Project / Diagram, Notification, Audit, Sync и Nuxt frontend.

Redis сейчас зарезервирован инфраструктурой, но приложением не используется.

## Запуск

```bash
cp .env.example .env.local
docker compose --env-file .env.local -f docker-compose.yml --profile infra --profile apps up -d --build
```

При первом запуске:

- `db-init` создаёт схемы, применяет миграции и seed во все 4 БД;
- Traefik отдаёт локальный самоподписанный сертификат;
- `user-service` создаёт development-администратора из `DEV_ADMIN_*`.

Открыть: **https://app.rp-gant.localhost**

Администратор по умолчанию:

```text
admin@rp-gant.local
ChangeMeDevOnly!
```

Проверка:

```bash
docker compose --env-file .env.local -f docker-compose.yml --profile infra --profile apps ps
curl -k https://app.rp-gant.localhost/health
curl -k https://app.rp-gant.localhost/api/v1/health
```

Остановка:

```bash
docker compose --env-file .env.local -f docker-compose.yml --profile infra --profile apps down
```

Удаление данных:

```bash
docker compose --env-file .env.local -f docker-compose.yml --profile infra --profile apps down -v
```

## Профили Compose

- `infra` — PostgreSQL, Redis, Kafka, Kafka UI, Mailpit, mock Telegram, Traefik;
- `apps` — API Gateway, User & Access, Project / Diagram, Notification, Audit, Sync, frontend;
- `monitoring` — Prometheus и Grafana.

Для запуска мониторинга:

```bash
docker compose --env-file .env.local -f docker-compose.yml --profile monitoring up -d prometheus grafana
```

## Данные и миграция

- `db-init` идемпотентен: повторный `up` не требует ручных миграций.
- `pnpm local:backup` сохраняет дампы всех БД в `backups/`.
- `pnpm local:restore -- backups/<file>.sql` восстанавливает дамп.
- `pnpm local:verify-restore` проверяет восстановление в отдельном контейнере.
- После перехода с `smart-oati` volumes называются `rp-gant_*`, а БД — `rp_gant_*`.
  Порядок переноса описан в [`docs/MIGRATION-rp-gant.md`](../../docs/MIGRATION-rp-gant.md).

## HTTPS

Traefik использует собственный самоподписанный сертификат. Браузер покажет предупреждение — для local его нужно принять один раз.

Доверенный сертификат можно подключить позже через `tls.certificates` в `traefik/dynamic.yml`.

## Домены

- `app.rp-gant.localhost` — frontend;
- `api.rp-gant.localhost` — API Gateway;
- `mail.rp-gant.localhost` — Mailpit UI;
- `kafka.rp-gant.localhost` — Kafka UI;
- `sync.rp-gant.localhost` — Sync Service WebSocket;
- `notify.rp-gant.localhost` — Notification Service HTTP; WebSocket запланирован, но не реализован.

## Порты

| Сервис | Host |
|---|---:|
| PostgreSQL | 5432 |
| Redis | 6379 (приложением не используется) |
| Kafka | 9092 |
| Kafka UI | 8081 |
| Mailpit SMTP | 1025 |
| Mailpit UI | 8025 |
| User & Access gRPC | 50051 |
| Project / Diagram gRPC | internal 50051 |
| Sync / Notification / Audit HTTP | internal 8080 |
| Traefik HTTP/HTTPS | 80/443 |

## Ограничения

- Kafka в local — один KRaft-брокер, replication factor 1.
- Telegram — WireMock, реальный бот не нужен.
- Frontend — Nuxt SPA из `apps/frontend`; legacy `apps/web` Compose не запускает.
- Sync обслуживается через `sync.rp-gant.localhost`; notification-service работает по HTTP, WebSocket для уведомлений не реализован.
- Импорт JSON v2/CSV доступен через API и модалку «Импорт» в интерфейсе.
