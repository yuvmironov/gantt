import { fileURLToPath } from 'node:url';
import { createGrpcClient } from '@smart-oati/service-kit';

const protoRoot = fileURLToPath(new URL('../../../proto', import.meta.url));

export function createProjectClient({
  address = process.env.PROJECT_SERVICE_GRPC ?? 'localhost:50051',
} = {}) {
  return createGrpcClient({
    protoPath: `${protoRoot}/smartoati/project/v1/project_service.proto`,
    includeDirs: [protoRoot],
    packageName: 'smartoati.project.v1',
    serviceName: 'ProjectService',
    address,
  });
}

export function call(client, method, request, metadata) {
  return new Promise((resolve, reject) => {
    const callback = (error, response) => {
      if (error) reject(error);
      else resolve(response);
    };
    if (metadata) client[method](request, metadata, callback);
    else client[method](request, callback);
  });
}
