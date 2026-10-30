# Локальная инфраструктура SMART OATI

Поднимает PostgreSQL, Redis, Kafka, Kafka UI, Mailpit, mock Telegram, Traefik, API Gateway, User & Access, Project / Diagram и минимальный frontend.

## Запуск

```bash
cp .env.example .env.local
docker compose --env-file .env.local -f docker-compose.yml --profile infra --profile apps up -d --build
```

При первом запуске:

- `db-init` создаёт схемы, применяет миграции и seed во все 4 БД;
- Traefik отдаёт локальный самоподписанный сертификат;
- `user-service` создаёт development-администратора из `DEV_ADMIN_*`.

Открыть: **https://app.localhost**

Администратор по умолчанию:

```text
admin@smart-oati.local
ChangeMeDevOnly!
```

Проверка:

```bash
docker compose --env-file .env.local -f docker-compose.yml --profile infra --profile apps ps
curl -k https://app.localhost/health
curl -k https://app.localhost/api/v1/health
```

Остановка:

```bash
docker compose --env-file .env.local -f docker-compose.yml --profile infra --profile apps down
```

Удаление данных:

```bash
docker compose --env-file .env.local -f docker-compose.yml --profile infra --profile apps down -v
```

## HTTPS

Traefik использует собственный самоподписанный сертификат. Браузер покажет предупреждение — для local его нужно принять один раз.

Доверенный сертификат можно подключить позже через `tls.certificates` в `traefik/dynamic.yml`.

## Домены

- `app.localhost` — frontend;
- `api.localhost` — API Gateway;
- `mail.localhost` — Mailpit UI;
- `kafka.localhost` — Kafka UI;
- `sync.localhost`, `notify.localhost` — зарезервированы.

## Порты

| Сервис | Host |
|---|---:|
| PostgreSQL | 5432 |
| Redis | 6379 |
| Kafka | 9092 |
| Kafka UI | 8081 |
| Mailpit SMTP | 1025 |
| Mailpit UI | 8025 |
| User & Access gRPC | 50051 |
| Project / Diagram gRPC | internal 50051 |
| Traefik HTTP/HTTPS | 80/443 |

## Ограничения

- Kafka в local — один KRaft-брокер, replication factor 1.
- Telegram — WireMock, реальный бот не нужен.
- Frontend — минимальный bootstrap UI, не полный Nuxt-интерфейс.
- `sync.localhost` и `notify.localhost` пока не обслуживаются.
- Импорт JSON v2/CSV работает через API и кнопку «Импорт» в интерфейсе.
