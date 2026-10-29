const TITLES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export class ServiceError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = status;
  }
}

export function problemHandler(error, request, reply) {
  const status = error.statusCode ?? 500;
  const code = status >= 500 ? 'internal_error' : (error.code ?? 'request_failed');
  const detail = status >= 500 ? 'Internal server error' : error.message;

  request.log.error({ err: error }, 'request failed');
  return reply
    .code(status)
    .type('application/problem+json')
    .send({
      type: `https://smart-oati.local/problems/${code}`,
      title: TITLES[status] ?? 'Error',
      status,
      detail,
      instance: request.url,
      code,
      traceId: request.id,
    });
}

export function notFoundHandler(request, reply) {
  return reply.code(404).type('application/problem+json').send({
    type: 'https://smart-oati.local/problems/not_found',
    title: TITLES[404],
    status: 404,
    detail: 'Resource not found',
    instance: request.url,
    code: 'not_found',
    traceId: request.id,
  });
}
