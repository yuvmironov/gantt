import { startService } from '@smart-oati/service-kit';
import { buildApp } from './app.js';
import { closePool, createPool } from './db.js';
import { startProjectGrpcServer } from './grpc.js';
import { createProjectImplementation } from './projects.js';
import { createUserClient } from './user-client.js';

const app = buildApp();
const db = createPool();
const userClient = createUserClient({
  address: process.env.USER_SERVICE_GRPC ?? 'localhost:50051',
});
const grpc = await startProjectGrpcServer({
  port: Number(process.env.GRPC_PORT ?? 50051),
  implementation: createProjectImplementation({ db, userClient }),
});
app.log.info({ grpcPort: grpc.port }, 'gRPC server started');

try {
  await startService(app, {
    shutdownHooks: [grpc.close, () => closePool(db), () => userClient.close()],
  });
} catch (error) {
  await grpc.close();
  await closePool(db);
  userClient.close();
  throw error;
}
