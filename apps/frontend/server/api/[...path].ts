export default defineEventHandler((event) => {
  return proxyRequest(event, "http://api-gateway:8080" + event.path);
});
