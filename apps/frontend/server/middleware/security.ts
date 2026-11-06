export default defineEventHandler((event) => {
  const response = event.node.res;
  const host = String(event.node.req.headers.host ?? "")
    .split(":")[0]
    .toLowerCase();
  const safeHost = /^[a-z0-9.-]+$/.test(host) ? host : "";
  const syncHost = safeHost.startsWith("app.") ? safeHost.replace(/^app\./, "sync.") : safeHost;
  const connectSrc = syncHost ? `'self' wss://${syncHost}` : "'self'";

  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      `img-src 'self' data:; font-src 'self' data:; connect-src ${connectSrc}; ` +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
});
