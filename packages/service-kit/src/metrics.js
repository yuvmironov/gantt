import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'smart_oati_' });

  const requests = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  return { registry, requests, duration };
}

export function registerMetrics(app, metrics) {
  app.get('/metrics', async (_request, reply) => {
    reply.type(metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  app.addHook('onResponse', async (request, reply) => {
    if (request.routeOptions?.url === '/metrics') return;
    const labels = {
      method: request.method,
      route: request.routeOptions?.url ?? 'unmatched',
      status: String(reply.statusCode),
    };
    metrics.requests.inc(labels);
    metrics.duration.observe(labels, reply.elapsedTime / 1000);
  });
}
