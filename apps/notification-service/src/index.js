import { startService } from '@smart-oati/service-kit';
import { buildApp } from './app.js';
import { closePool, createPool } from './db.js';
import { startNotificationConsumer } from './events.js';
import { startNotificationDeliveryWorker } from './delivery-worker.js';
import { createUserClient } from './user-client.js';

const db = createPool();
const userClient = createUserClient();
const app = buildApp({ db });
const stopConsumer = await startNotificationConsumer(db, userClient).catch((error) => {
  app.log.error(error, 'notification consumer failed to start');
  return async () => {};
});
const stopDelivery = startNotificationDeliveryWorker(db, userClient);

try {
  await startService(app, {
    shutdownHooks: [stopConsumer, stopDelivery, () => userClient.close?.(), () => closePool(db)],
  });
} catch (error) {
  await stopDelivery();
  await closePool(db);
  throw error;
}
