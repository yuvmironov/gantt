import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { notFoundHandler, problemHandler } from './errors.js';
import { registerHealthRoutes } from './health.js';

export function createService({
  name = 'service',
  version = '0.0.0',
  config = loadConfig(),
  logger = true,
  routes,
} = {}) {
  const app = Fastify({
    logger:
      logger === false
        ? false
        : logger === true
          ? {
              level: config.logLevel,
              redact: ['req.headers.authorization', 'req.headers.cookie'],
            }
          : logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    trustProxy: true,
  });

  app.decorate('serviceConfig', config);
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  app.setErrorHandler(problemHandler);
  app.setNotFoundHandler(notFoundHandler);
  registerHealthRoutes(app, { service: name, version });

  if (routes) app.register(routes);

  return app;
}

export async function startService(app, { port, host } = {}) {
  const config = app.serviceConfig;

  try {
    await app.listen({
      port: port ?? config.port,
      host: host ?? config.host,
    });
    app.log.info({ port: port ?? config.port, host: host ?? config.host }, 'service started');
  } catch (error) {
    app.log.error({ err: error }, 'service failed to start');
    process.exitCode = 1;
    throw error;
  }

  const shutdown = async (signal) => {
    app.log.info({ signal }, 'service stopping');
    try {
      await app.close();
      process.exitCode = 0;
    } catch (error) {
      app.log.error({ err: error }, 'service failed to stop');
      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  return app;
}
