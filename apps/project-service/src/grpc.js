import { fileURLToPath } from 'node:url';
import { loadGrpcService, startGrpcServer } from '@smart-oati/service-kit';

const protoRoot = fileURLToPath(new URL('../../../proto', import.meta.url));

export function loadProjectService() {
  return loadGrpcService({
    protoPath: `${protoRoot}/smartoati/project/v1/project_service.proto`,
    includeDirs: [protoRoot],
    packageName: 'smartoati.project.v1',
    serviceName: 'ProjectService',
  });
}

export function startProjectGrpcServer({ port = 50051, host = '0.0.0.0', implementation } = {}) {
  return startGrpcServer({
    protoPath: `${protoRoot}/smartoati/project/v1/project_service.proto`,
    includeDirs: [protoRoot],
    packageName: 'smartoati.project.v1',
    serviceName: 'ProjectService',
    implementation,
    port,
    host,
  });
}
