# Project / Diagram Service

Сервис проектов, диаграмм и плана.

Сейчас реализованы:

- HTTP health `/health/live`, `/health/ready`;
- gRPC-сервер на `50051`;
- стандартный `grpc.health.v1.Health` со статусом `SERVING`;
- загрузка контракта `smartoati.project.v1.ProjectService`;
- реализованы `CreateProject`, `ListProjects`, `GetProject`, `UpdateProject`;
- реализованы `ArchiveProject`, `UnarchiveProject`, `DeleteProject`, `RestoreProject`;
- реализованы `CreateDiagram`, `ListDiagrams`, `GetDiagram`, `UpdateDiagram`, `DeleteDiagram`;
- реализованы `CreateDirection`, `CreateTask`, `GetDiagramSnapshot`;
- создание проекта вызывает `EnsureProjectOwner` в User Service;
- список проектов использует `ListAccessibleProjectIds`;
- проверки прав идут через `CheckProjectPermission` с metadata `x-actor-user-id`;
- остальные методы зарегистрированы как `UNIMPLEMENTED`;
- PostgreSQL и graceful shutdown HTTP/gRPC/DB;
- Dockerfile для non-root runtime.

gRPC-порт в Compose: `localhost:50052`.
