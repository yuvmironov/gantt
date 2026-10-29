# Project / Diagram Service

Сервис проектов, диаграмм и плана.

Сейчас реализованы:

- HTTP health `/health/live`, `/health/ready`;
- gRPC-сервер на `50051`;
- стандартный `grpc.health.v1.Health` со статусом `SERVING`;
- загрузка контракта `smartoati.project.v1.ProjectService`;
- все 44 метода зарегистрированы как `UNIMPLEMENTED`;
- graceful shutdown HTTP и gRPC;
- Dockerfile для non-root runtime.

gRPC-порт в Compose: `localhost:50052`.
