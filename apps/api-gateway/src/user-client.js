import { fileURLToPath } from 'node:url';
import { createGrpcClient } from '@smart-oati/service-kit';

const protoRoot = fileURLToPath(new URL('../../../proto', import.meta.url));

export function createUserClient({
  address = process.env.USER_SERVICE_GRPC ?? 'localhost:50051',
} = {}) {
  return createGrpcClient({
    protoPath: `${protoRoot}/smartoati/user/v1/user_service.proto`,
    includeDirs: [protoRoot],
    packageName: 'smartoati.user.v1',
    serviceName: 'UserService',
    address,
  });
}

export function call(client, method, request) {
  return new Promise((resolve, reject) => {
    client[method](request, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}
