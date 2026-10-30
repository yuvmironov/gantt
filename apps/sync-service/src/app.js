import { createService, loadConfig } from '@smart-oati/service-kit';
import { WebSocketServer } from 'ws';

const serviceName = 'sync-service';
const serviceVersion = '0.1.0';

export function buildApp({ env = process.env, logger = true } = {}) {
  const config = loadConfig(env, {
    logLevel: env.LOG_LEVEL ?? 'info',
    port: 8080,
  });

  const wss = new WebSocketServer({ noServer: true });
  const app = createService({
    name: serviceName,
    version: serviceVersion,
    config,
    logger,
    routes: async (instance) => {
      instance.post('/internal/broadcast', async (request) => {
        const payload = JSON.stringify(request.body ?? {});
        let delivered = 0;
        for (const client of wss.clients) {
          if (client.readyState === 1) {
            client.send(payload);
            delivered += 1;
          }
        }
        return { delivered };
      });
    },
  });

  app.server.on('upgrade', (request, socket, head) => {
    if ((request.url ?? '') !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit('connection', client, request);
    });
  });
  wss.on('connection', (client) => {
    client.send(JSON.stringify({ type: 'connected', service: serviceName }));
    client.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ping') {
          client.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
        }
      } catch {
        client.send(JSON.stringify({ type: 'error', code: 'invalid_message' }));
      }
    });
  });
  app.addHook('onClose', async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  return app;
}
