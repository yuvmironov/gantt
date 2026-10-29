import { startService } from '@smart-oati/service-kit';
import { buildApp } from './app.js';
import { createUserImplementation } from './auth.js';
import { closePool, createPool } from './db.js';
import { startUserGrpcServer } from './grpc.js';

const app = buildApp();
const db = createPool();
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
    shutdownHooks: [grpc.close, () => closePool(db)],
  });
} catch (error) {
  await grpc.close();
  await closePool(db);
  throw error;
}
