# Helm service template

Универсальный Helm-чарт для сервисов SMART OATI. Используется как основа для `api-gateway`, `user-service`, `project-service`, `notification-service`, `audit-service`, `sync-service` и `frontend`.

## Что внутри

- Deployment со стратегией RollingUpdate.
- Service.
- ServiceAccount.
- HPA (опционально).
- PDB.
- Ingress (опционально, `yandex-alb`).
- NetworkPolicy (опционально).
- Probes `/health/live` и `/health/ready`.
- Security context non-root.
- Resource requests/limits.

## Как использовать

1. Скопировать `service-template` в отдельный чарт сервиса.
2. Заменить `Chart.yaml` и `values.yaml`.
3. Указать image digest из GHCR.
4. Настроить env/envFrom и Vault/External Secrets.
5. Включить ingress только для frontend/API/Sync/Notification.
6. Проверить `helm template`.

## Пример

```bash
helm template api-gateway ./service-template \
  --namespace smart-oati \
  --set image.repository=ghcr.io/org/smart-oati/api-gateway \
  --set image.digest=sha256:... \
  --set replicaCount=2
```

## Проверено

- Helm `v4.3.1`.
- Kubernetes `v1.36.1` (Docker Desktop).
- `helm lint` — 0 ошибок.
- `helm template` — успешно.
- `helm install --dry-run=server` — успешно.
- Runtime install с тестовым образом `nginxinc/nginx-unprivileged:1.27-alpine`: 2/2 pod Running, HTTP 200, PDB и Service созданы.
- Тестовый release и namespace удалены.

## Правила

- В values нет секретов.
- В production — только digest, не tag.
- Не включать `latest`.
- NetworkPolicy включается после настройки правил.
- PDB обязателен для production.
- Ingress для внутренних gRPC не создается.
