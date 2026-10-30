import { startService } from '@smart-oati/service-kit';
import { buildApp } from './app.js';
import { closePool, createPool } from './db.js';

const db = createPool();
const app = buildApp({ db });

try {
  await startService(app, {
    shutdownHooks: [() => closePool(db)],
  });
} catch (error) {
  await closePool(db);
  throw error;
}
