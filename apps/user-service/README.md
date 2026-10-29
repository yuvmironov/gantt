# User & Access Service

Первый доменный сервис SMART OATI.

Сейчас реализованы:

- HTTP health `/health/live`, `/health/ready`;
- gRPC-сервер на `50051`;
- стандартный `grpc.health.v1.Health` со статусом `SERVING`;
- загрузка контракта `smartoati.user.v1.UserService`;
- реализованы `Register`, `VerifyEmail`, `Login`, `ValidateSession`, `Logout`;
- остальные методы зарегистрированы как `UNIMPLEMENTED`;
- PostgreSQL, Argon2id, cookie-сессии, lockout после неудачных попыток;
- `DEV_AUTO_VERIFY=true` для local автоматически подтверждает email при регистрации;
- graceful shutdown HTTP, gRPC и PostgreSQL pool;
- Dockerfile для non-root runtime.

Проверка gRPC-контракта:

```powershell
pnpm test:unit
```

Запуск в Compose:

```powershell
docker compose --env-file infrastructure/local/.env.local `
  --profile infra --profile apps `
  -f infrastructure/local/docker-compose.yml up -d --build user-service
```

gRPC порт: `localhost:50051`. HTTP health: `http://localhost:8080/health/live` внутри контейнера.
