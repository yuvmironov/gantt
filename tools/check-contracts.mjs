import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

function countFiles(directory, extension) {
  return readdirSync(join(root, directory), { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith(extension),
  ).length;
}

const openapi = readJson('openapi/openapi.json');
const paths = Object.keys(openapi.paths ?? {});
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const operations = paths.reduce(
  (total, path) =>
    total + Object.keys(openapi.paths[path]).filter((key) => methods.has(key)).length,
  0,
);

check(paths.length === 76, `OpenAPI paths: expected 76, got ${paths.length}`);
check(operations === 99, `OpenAPI operations: expected 99, got ${operations}`);
check(Object.keys(openapi.components?.schemas ?? {}).length === 72, 'OpenAPI schemas: expected 72');

const eventTypes = readJson('events/event-types.json');
check(eventTypes.events?.length === 68, 'Event types: expected 68');
check(
  eventTypes.events?.every((event) => ['implemented', 'planned'].includes(event.status)),
  'Every event must have implemented/planned status',
);

const payloads = readJson('events/schemas/payloads.schema.json');
check(Object.keys(payloads.$defs ?? {}).length === 79, 'Event payload definitions: expected 79');

const protoFiles = readdirSync(join(root, 'proto'), { recursive: true }).filter((file) =>
  String(file).endsWith('.proto'),
);
check(protoFiles.length === 6, 'Proto files: expected 6');

check(
  countFiles('notifications/templates', '.html') === 17,
  'HTML notification templates: expected 17',
);
check(
  countFiles('notifications/templates', '.txt') === 17,
  'Text notification templates: expected 17',
);

check(existsSync(join(root, 'contracts/rest-grpc-map.yaml')), 'REST/gRPC mapping is missing');
check(existsSync(join(root, 'openapi/openapi.yaml')), 'openapi.yaml is missing');
check(
  existsSync(join(root, 'notifications/templates/manifest.json')),
  'Template manifest is missing',
);

for (const migration of [
  'db/migrations/user_access',
  'db/migrations/project_diagram',
  'db/migrations/notification',
  'db/migrations/audit',
]) {
  check(existsSync(join(root, migration)), `Migration directory is missing: ${migration}`);
}

if (failures.length > 0) {
  console.error('Contract checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Contract checks passed: ${paths.length} paths, ${operations} operations, ${eventTypes.events.length} events, ${protoFiles.length} protos.`,
  );
}
