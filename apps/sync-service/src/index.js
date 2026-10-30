import { startService } from '@smart-oati/service-kit';
import { buildApp } from './app.js';
import { startSyncConsumer } from './events.js';

const app = buildApp();
const stopConsumer = await startSyncConsumer().catch((error) => {
  app.log.error(error, 'sync consumer failed to start');
  return async () => {};
});
await startService(app, { shutdownHooks: [stopConsumer] });
