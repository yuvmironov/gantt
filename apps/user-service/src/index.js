import { startService } from '@smart-oati/service-kit';
import { buildApp } from './app.js';
import { createUserImplementation, ensureDevAdmin } from './auth.js';
import { closePool, createPool } from './db.js';
import { startUserOutboxPublisher } from './events-publisher.js';
import { startUserGrpcServer } from './grpc.js';

const app = buildApp();
const db = createPool();
if (process.env.DEV_AUTO_VERIFY === 'true' && (await ensureDevAdmin(db))) {
  app.log.info('development admin is ready');
}
const stopOutbox = startUserOutboxPublisher(db);
const grpc = await startUserGrpcServer({
  port: Number(process.env.GRPC_PORT ?? 50051),
  implementation: createUserImplementation({
    db,
    devAutoVerify: process.env.DEV_AUTO_VERIFY === 'true',
  }),
});
app.log.info({ grpcPort: grpc.port }, 'gRPC server started');

try {
  await startService(app, {
    shutdownHooks: [stopOutbox, grpc.close, () => closePool(db)],
  });
} catch (error) {
  await stopOutbox();
  await grpc.close();
  await closePool(db);
  throw error;
}
