const DEFAULT_PORT = 8080;

export function loadConfig(env = process.env, defaults = {}) {
  const port = Number(env.PORT ?? defaults.port ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid_port:${env.PORT ?? defaults.port ?? DEFAULT_PORT}`);
  }

  return {
    host: env.HOST ?? defaults.host ?? '0.0.0.0',
    logLevel: env.LOG_LEVEL ?? defaults.logLevel ?? 'info',
    nodeEnv: env.NODE_ENV ?? defaults.nodeEnv ?? 'development',
    port,
  };
}
