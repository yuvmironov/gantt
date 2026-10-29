# API Gateway

Тонкий входной слой SMART OATI.

Сейчас реализованы:

- Fastify 5;
- `/health/live`, `/health/ready`;
- `/api/v1/health`;
- request id;
- RFC 7807 errors;
- graceful shutdown;
- Dockerfile для non-root runtime.

Запуск:

```powershell
pnpm start:api-gateway
```

Проверка:

```powershell
curl http://localhost:8080/health/live
curl http://localhost:8080/api/v1/health
```

Docker:

```powershell
docker build -f apps/api-gateway/Dockerfile -t smart-oati/api-gateway:dev .
docker run --rm -p 8080:8080 smart-oati/api-gateway:dev
```
