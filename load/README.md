# Load smoke

```bash
BASE_URL=https://app.localhost VUS=10 DURATION=30s k6 run --insecure-skip-tls-verify load/smoke.js
```

`--insecure-skip-tls-verify` нужен только для локального self-signed Traefik. Проверяет health endpoint и базовые пороги latency/error rate. Локальный прогон: 10 VUs, 20s, 200/200 checks, p95 43 ms, 0% ошибок. Для auth/API-нагрузки нужен отдельный сценарий с логином и CSRF.
