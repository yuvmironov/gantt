import { createService, loadConfig } from '@smart-oati/service-kit';

const serviceName = 'api-gateway';
const serviceVersion = '0.1.0';

export function buildApp({ env = process.env, logger = true } = {}) {
  const config = loadConfig(env, {
    logLevel: env.LOG_LEVEL ?? 'info',
    port: 8080,
  });

  return createService({
    name: serviceName,
    version: serviceVersion,
    config,
    logger,
    routes: async (app) => {
      app.get('/api/v1/health', async () => ({
        status: 'ok',
        service: serviceName,
        version: serviceVersion,
      }));
    },
  });
}
