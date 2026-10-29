# SMART OATI

РЎРµСЂРІРµСЂРЅР°СЏ РІРµСЂСЃРёСЏ РїР»Р°РЅРёСЂРѕРІС‰РёРєР° SMART OATI.

Р РµРїРѕР·РёС‚РѕСЂРёР№ РЅР°С…РѕРґРёС‚СЃСЏ РІ СЃС‚Р°РґРёРё bootstrap: РєРѕРЅС‚СЂР°РєС‚С‹, РёРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂРЅС‹Р№ РєР°СЂРєР°СЃ Рё CI СѓР¶Рµ РїРѕРґРіРѕС‚РѕРІР»РµРЅС‹, РїСЂРёР»РѕР¶РµРЅРёСЏ СЃРµСЂРІРёСЃРѕРІ Р±СѓРґСѓС‚ РґРѕР±Р°РІР»СЏС‚СЊСЃСЏ СЃР»РµРґСѓСЋС‰РёРјРё СЌС‚Р°РїР°РјРё.

## РўСЂРµР±РѕРІР°РЅРёСЏ

- Node.js 22 LTS;
- pnpm 10 С‡РµСЂРµР· Corepack;
- Docker Desktop/Engine + Compose v2;
- mkcert;
- Helm 3.16+ РёР»Рё Helm 4.x Рё kubectl вЂ” РґР»СЏ Kubernetes. Chart РїСЂРѕРІРµСЂРµРЅ РЅР° Helm 4.3.1.

## Р‘С‹СЃС‚СЂС‹Р№ СЃС‚Р°СЂС‚

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install
pnpm test
```

Р›РѕРєР°Р»СЊРЅР°СЏ РёРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР°:

```bash
cp infrastructure/local/.env.example infrastructure/local/.env.local
docker compose --env-file infrastructure/local/.env.local --profile infra --profile apps -f infrastructure/local/docker-compose.yml up -d --build
```

HTTPS-СЃРµСЂС‚РёС„РёРєР°С‚С‹:

```bash
cd infrastructure/local
mkcert -install
mkcert -cert-file certs/local.pem -key-file certs/local-key.pem "*.localhost" localhost 127.0.0.1 ::1
```

## РљРѕРјР°РЅРґС‹

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm test:unit
pnpm test:contract
pnpm build
pnpm start:api-gateway
pnpm start:user-service
```

## РЎС‚СЂСѓРєС‚СѓСЂР°

```text
apps/api-gateway/      # HTTP API Gateway + health/config/errors/shutdown
apps/user-service/     # User & Access: auth, sessions, HTTP health + gRPC
packages/service-kit/  # РѕР±С‰РёР№ РєР°СЂРєР°СЃ Fastify/gRPC-СЃРµСЂРІРёСЃРѕРІ
packages/shared/       # РѕР±С‰РёРµ СѓС‚РёР»РёС‚С‹
contracts/             # REST/gRPC mapping, import/export
proto/                 # protobuf-РєРѕРЅС‚СЂР°РєС‚С‹
openapi/               # OpenAPI
events/                # СЃРѕР±С‹С‚РёСЏ
notifications/         # С€Р°Р±Р»РѕРЅС‹ Рё СЃС…РµРјС‹
db/                    # РјРёРіСЂР°С†РёРё Рё seed
infrastructure/local/  # Docker Compose
infrastructure/helm/   # Helm-РєР°СЂРєР°СЃ
tools/                 # РїСЂРѕРІРµСЂРєРё РєРѕРЅС‚СЂР°РєС‚РѕРІ
```

## Р”РѕРєСѓРјРµРЅС‚Р°С†РёСЏ

Р’ СЌС‚РѕРј СЂРµРїРѕР·РёС‚РѕСЂРёРё РЅР°С…РѕРґСЏС‚СЃСЏ РєРѕРґ, РєРѕРЅС‚СЂР°РєС‚С‹ Рё РёРЅР¶РµРЅРµСЂРЅС‹Рµ Р°СЂС‚РµС„Р°РєС‚С‹. РџСЂРѕРґСѓРєС‚РѕРІС‹Рµ РїРѕСЃС‚Р°РЅРѕРІРєРё, P0-РїР°РєРµС‚, ADR Рё visual design РІРµРґСѓС‚СЃСЏ РІ РѕС‚РґРµР»СЊРЅРѕРј СЂР°Р±РѕС‡РµРј РєР°С‚Р°Р»РѕРіРµ РїСЂРѕРµРєС‚Р°. РџСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё РёС… РјРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ РІ `docs/`.

## РЎС‚Р°С‚СѓСЃ

- [x] РљРѕРЅС‚СЂР°РєС‚С‹ OpenAPI/proto/events.
- [x] DDL, seed, import/export.
- [x] P0-РґРѕРєСѓРјРµРЅС‚С‹ Рё ADR РїРѕРґРіРѕС‚РѕРІР»РµРЅС‹.
- [x] Р‘Р°Р·РѕРІС‹Р№ CI Рё РїСЂРѕРІРµСЂРєРё РєРѕРЅС‚СЂР°РєС‚РѕРІ.
- [x] Docker Compose РґР»СЏ РёРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂС‹.
- [x] Helm service template.
- [x] API Gateway skeleton + Dockerfile.
- [x] API Gateway Compose profile + Helm chart.
- [x] User & Access: auth, sessions, HTTP health + gRPC.
- [ ] РћСЃС‚Р°Р»СЊРЅС‹Рµ СЃРµСЂРІРёСЃС‹.
- [ ] Staging/prod Helm values.
- [ ] E2E Рё load tests.
