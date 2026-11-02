# Load scenarios

Health smoke:

```bash
BASE_URL=https://app.localhost VUS=10 DURATION=30s k6 run --insecure-skip-tls-verify load/smoke.js
```

Authenticated API scenario:

```bash
BASE_URL=https://app.localhost EMAIL=demo.owner@smart-oati.local PASSWORD=DemoPassword123! \
  VUS=5 DURATION=30s k6 run --insecure-skip-tls-verify load/authenticated.js
```

`--insecure-skip-tls-verify` is needed only for the local self-signed Traefik certificate. The authenticated scenario logs in, lists projects and creates a project per iteration.
