import { fileURLToPath } from 'node:url';
import { loadGrpcService, startGrpcServer } from '@smart-oati/service-kit';

const protoRoot = fileURLToPath(new URL('../../../proto', import.meta.url));

export function loadUserService() {
  return loadGrpcService({
    protoPath: `${protoRoot}/smartoati/user/v1/user_service.proto`,
    includeDirs: [protoRoot],
    packageName: 'smartoati.user.v1',
    serviceName: 'UserService',
  });
}

export function startUserGrpcServer({ port = 50051, host = '0.0.0.0', implementation } = {}) {
  return startGrpcServer({
    protoPath: `${protoRoot}/smartoati/user/v1/user_service.proto`,
    includeDirs: [protoRoot],
    packageName: 'smartoati.user.v1',
    serviceName: 'UserService',
    implementation,
    port,
    host,
  });
}
