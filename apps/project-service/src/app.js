import { createService, loadConfig } from '@smart-oati/service-kit';

const serviceName = 'project-service';
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
  });
}
