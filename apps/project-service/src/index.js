import { startService } from '@smart-oati/service-kit';
import { buildApp } from './app.js';
import { startProjectGrpcServer } from './grpc.js';

const app = buildApp();
const grpc = await startProjectGrpcServer({
  port: Number(process.env.GRPC_PORT ?? 50051),
});
app.log.info({ grpcPort: grpc.port }, 'gRPC server started');

try {
  await startService(app, { shutdownHooks: [grpc.close] });
} catch (error) {
  await grpc.close();
  throw error;
}
