# Load smoke

```bash
BASE_URL=https://app.localhost VUS=10 DURATION=30s k6 run load/smoke.js
```

Проверяет health endpoint и базовые пороги latency/error rate. Для auth/API-нагрузки нужен отдельный сценарий с логином и CSRF.
