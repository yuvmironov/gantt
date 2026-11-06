# Project / Diagram Service

Сервис проектов, диаграмм и плана.

Сейчас реализованы:

- HTTP health `/health/live`, `/health/ready`;
- gRPC-сервер на `50051`;
- стандартный `grpc.health.v1.Health` со статусом `SERVING`;
- загрузка контракта `rpgant.project.v1.ProjectService`;
- проекты: `CreateProject`, `ListProjects` (active/archived/deleted), `GetProject`, `UpdateProject`, `ArchiveProject`, `UnarchiveProject`, `DeleteProject`, `RestoreProject`, `TransferProjectOwner`, `CheckUserOwnsProjects`, `PurgeExpiredProjects`;
- диаграммы: `CreateDiagram`, `ListDiagrams`, `GetDiagram`, `UpdateDiagram`, `DeleteDiagram`, `ListDiagramChanges`;
- направления: `CreateDirection`, `UpdateDirection`, `DeleteDirection`, `ReorderDirections`, `SetDirectionResponsible`;
- задачи: `CreateTask`, `GetTask`, `UpdateTask`, `MoveTask`, `UpdateTaskProgress`, `SetTaskAssignments`, `DeleteTask`;
- при `estimated_hours > 0` окончание рассчитывается по 8 ч/день с учётом календаря и праздников; пересчёт выполняется при смене режима календаря и списка праздников;
- зависимости: `CreateDependency`, `ListDependencies`, `UpdateDependency`, `DeleteDependency`;
- правила зависимостей: `direction → direction` и `task → direction` разрешены, `direction → task` запрещён; циклы проверяются по всему графу;
- БД дополнительно защищена constraint `dependencies_no_direction_to_task`;
- комментарии: `ListComments`, `CreateComment`, `UpdateComment`, `DeleteComment`;
- календарь: `GetHolidays`, `UpdateHolidays`;
- снимок: `GetDiagramSnapshot`;
- импорт: `StartImport`, `GetImportStatus`, `CancelImport`;
- экспорт: `ExportDiagram`;
- создание проекта вызывает `EnsureProjectOwner` в User Service;
- список проектов использует `ListAccessibleProjectIds`;
- проверки прав идут через `CheckProjectPermission` с metadata `x-actor-user-id`;
- PostgreSQL, Kafka-события и graceful shutdown HTTP/gRPC/DB;
- Dockerfile для non-root runtime.

gRPC-порт в Compose: `project-service:50051` (внутри сети), наружу не публикуется.
