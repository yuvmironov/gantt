# Project / Diagram Service

Сервис проектов, диаграмм и плана.

Сейчас реализованы:

- HTTP health `/health/live`, `/health/ready`;
- gRPC-сервер на `50051`;
- стандартный `grpc.health.v1.Health` со статусом `SERVING`;
- загрузка контракта `smartoati.project.v1.ProjectService`;
- реализованы `CreateProject` и `ListProjects`;
- создание проекта вызывает `EnsureProjectOwner` в User Service;
- список проектов использует `ListAccessibleProjectIds`;
- остальные методы зарегистрированы как `UNIMPLEMENTED`;
- PostgreSQL и graceful shutdown HTTP/gRPC/DB;
- Dockerfile для non-root runtime.

gRPC-порт в Compose: `localhost:50052`.
