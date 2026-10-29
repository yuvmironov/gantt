# User & Access Service

Первый доменный сервис SMART OATI.

Сейчас реализованы:

- HTTP health `/health/live`, `/health/ready`;
- gRPC-сервер на `50051`;
- загрузка контракта `smartoati.user.v1.UserService`;
- все 52 метода зарегистрированы как `UNIMPLEMENTED` до реализации доменной логики;
- graceful shutdown HTTP и gRPC;
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
