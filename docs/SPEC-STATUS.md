# Состояние спецификаций

Документ фиксирует, какие контракты реализованы, а какие зарезервированы.

## REST API

- Источник: `apps/api-gateway/src/*.js`.
- Спецификации: `openapi/openapi.json` и `openapi/openapi.yaml`.
- Проверено: **76 paths, 99 operations**.
- Покрыты все фактические маршруты API Gateway, включая `/health`, `/settings`, `/sync/token`, контакты и Telegram, а также административные маршруты `/admin/users/*`.
- Параметры путей используют формат `{id}`.

## gRPC

- Контракты: `proto/rpgant/**`.
- 6 proto-файлов: UserService, ProjectService, NotificationService, AuditService, common и events.
- REST/gRPC mapping: `contracts/rest-grpc-map.yaml`.
- В mapping входят только операции, доступные через REST или используемые gateway внутренне.

## События Kafka

- Каталог: `events/event-types.json`.
- Всего событий: **68**.
- `status: implemented` — **30** событий, которые реально публикуются сервисами.
- `status: planned` — **38** событий, зарезервированных в дизайне, но пока не публикуемых.
- Envelope и payload-схемы используют snake_case, как в реальных сообщениях.
- `events/asyncapi.yaml` описывает общий канал; статусы событий указаны в каталоге.

## WebSocket sync

- `sync-service` реализует `/ws?token=...`.
- Project scope берётся из токена `GET /api/v1/sync/token`.
- Подписки/отписки не используются.
- Сервер отправляет `connected`, `diagram.changed`, `pong` и `error`.
- Спецификация: `sync/asyncapi.yaml`.

## Уведомления

- `notification-service` сейчас работает через Kafka и внутренний HTTP API.
- WebSocket `/ws/notifications` **не реализован**.
- `notifications/asyncapi.yaml` помечен как planned.
- Фронтенд загружает уведомления через REST API.

## Проверки

```bash
pnpm test:contract
pnpm lint
pnpm format:check
npx --yes @redocly/cli@latest lint openapi/openapi.yaml
```
