import { startService } from '@smart-oati/service-kit';
import { buildApp } from './app.js';
import { closePool, createPool } from './db.js';
import { startNotificationConsumer } from './events.js';

const db = createPool();
const app = buildApp({ db });
const stopConsumer = await startNotificationConsumer(db).catch((error) => {
  app.log.error(error, 'notification consumer failed to start');
  return async () => {};
});

try {
  await startService(app, {
    shutdownHooks: [stopConsumer, () => closePool(db)],
  });
} catch (error) {
  await closePool(db);
  throw error;
}
