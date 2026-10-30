import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || '30s',
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500'] },
};

export default function () {
  const response = http.get(`${__ENV.BASE_URL || 'https://app.localhost'}/api/v1/health`, {
    insecureSkipTLSVerify: true,
  });
  check(response, { 'health is 200': (r) => r.status === 200 });
  sleep(1);
}
