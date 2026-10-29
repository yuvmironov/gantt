# Локальная инфраструктура SMART OATI

Поднимает только инфраструктуру: PostgreSQL, Redis, Kafka, Kafka UI, Mailpit, mock Telegram и Traefik.

Приложения `frontend`, `api-gateway`, `user-service`, `project-service`, `notification-service`, `audit-service`, `sync-service` появятся следующими этапами. До этого Traefik-маршруты будут возвращать 502.

## Запуск

```bash
cp .env.example .env.local
docker compose --env-file .env.local --profile infra up -d
```

Проверка:

```bash
docker compose --env-file .env.local --profile infra ps
```

Остановка:

```bash
docker compose --env-file .env.local --profile infra down
```

Удаление данных:

```bash
docker compose --env-file .env.local --profile infra down -v
```

## HTTPS

```bash
mkdir -p certs
mkcert -install
mkcert -cert-file certs/local.pem -key-file certs/local-key.pem "*.localhost" localhost 127.0.0.1 ::1
```

Домены:

- `app.localhost` — frontend;
- `api.localhost` — API Gateway;
- `sync.localhost` — Sync WebSocket;
- `notify.localhost` — Notification;
- `mail.localhost` — Mailpit UI: host-порт 8025;
- `kafka.localhost` — Kafka UI: host-порт 8081.

## Порты

| Сервис | Host |
|---|---:|
| PostgreSQL | 5432 |
| Redis | 6379 |
| Kafka | 9092 |
| Kafka UI | 8081 |
| Mailpit SMTP | 1025 |
| Mailpit UI | 8025 |
| Traefik HTTP/HTTPS | 80/443 |

## Проверено

- PostgreSQL 17: 4 БД, миграции и seed применены.
- Redis: `PONG`.
- Kafka: topic `smartoati.events`, 6 partitions, produce/consume работают.
- Mailpit: SMTP-письмо принято и видно в API.
- Telegram WireMock: `sendMessage` возвращает `ok: true`.
- Traefik: HTTP→HTTPS, `mail.localhost` и `kafka.localhost` отдают 200.
- `api/app/sync/notify` возвращают 502 до появления приложений — это ожидаемо.
- Kafka: `apache/kafka:3.9.0`, один KRaft-брокер.
- TLS: если `mkcert` не установлен, можно использовать self-signed сертификаты; браузер будет предупреждать.

## Ограничения

- Kafka в local — один KRaft-брокер, replication factor 1.
- Telegram — WireMock, реальный бот не нужен.
- Traefik требует сгенерированные сертификаты.
- Приложения и Dockerfile еще не добавлены.
