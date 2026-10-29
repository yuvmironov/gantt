import cookie from '@fastify/cookie';
import { createService, loadConfig } from '@smart-oati/service-kit';
import { authRoutes } from './auth-routes.js';
import { createUserClient } from './user-client.js';

const serviceName = 'api-gateway';
const serviceVersion = '0.1.0';

export function buildApp({ env = process.env, logger = true, userClient } = {}) {
  const config = loadConfig(env, {
    logLevel: env.LOG_LEVEL ?? 'info',
    port: 8080,
  });
  const client =
    userClient ??
    createUserClient({
      address: env.USER_SERVICE_GRPC ?? 'localhost:50051',
    });

  const app = createService({
    name: serviceName,
    version: serviceVersion,
    config,
    logger,
    routes: async (instance) => {
      await instance.register(cookie);
      await instance.register(authRoutes, { userClient: client });

      instance.get('/api/v1/health', async () => ({
        status: 'ok',
        service: serviceName,
        version: serviceVersion,
      }));
    },
  });

  app.addHook('onClose', async () => {
    client.close?.();
  });

  return app;
}
