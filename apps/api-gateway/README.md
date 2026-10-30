# API Gateway

Тонкий входной слой SMART OATI.

Сейчас реализованы:

- Fastify 5;
- `/health/live`, `/health/ready`;
- `/api/v1/health`;
- REST auth:
  - `POST /api/v1/auth/register`;
  - `POST /api/v1/auth/email/verify`;
  - `POST /api/v1/auth/login`;
  - `GET /api/v1/auth/session`;
  - `POST /api/v1/auth/logout`;
- REST projects:
  - `GET /api/v1/projects`;
  - `POST /api/v1/projects`;
  - `GET /api/v1/projects/{projectId}`;
  - `PATCH /api/v1/projects/{projectId}`;
  - `POST /api/v1/projects/{projectId}/archive`;
  - `POST /api/v1/projects/{projectId}/unarchive`;
  - `DELETE /api/v1/projects/{projectId}`;
  - `POST /api/v1/projects/{projectId}/restore`;
- REST diagrams:
  - `GET /api/v1/projects/{projectId}/diagrams`;
  - `POST /api/v1/projects/{projectId}/diagrams`;
  - `GET /api/v1/diagrams/{diagramId}`;
  - `PATCH /api/v1/diagrams/{diagramId}`;
  - `DELETE /api/v1/diagrams/{diagramId}`;
  - `POST /api/v1/diagrams/{diagramId}/directions`;
  - `POST /api/v1/diagrams/{diagramId}/tasks`;
  - `GET /api/v1/diagrams/{diagramId}/snapshot`;
- gRPC-клиенты к User Service и Project Service;
- передача `Set-Cookie` от User Service клиенту;
- CSRF-проверка logout и создания проекта;
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
