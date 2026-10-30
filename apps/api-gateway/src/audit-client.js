export function createAuditClient({ baseUrl }) {
  async function request(path) {
    const response = await fetch(`${baseUrl}${path}`);
    if (!response.ok) {
      const error = new Error(`audit_service_${response.status}`);
      error.code = 13;
      throw error;
    }
    return response.json();
  }
  return { request };
}
