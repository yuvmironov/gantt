export function registerHealthRoutes(app, { service, version }) {
  app.get('/health/live', async () => ({
    status: 'ok',
    service,
    version,
  }));

  app.get('/health/ready', async () => ({
    status: 'ready',
    service,
    version,
  }));
}
