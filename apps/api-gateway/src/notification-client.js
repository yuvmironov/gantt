export function createNotificationClient({ baseUrl }) {
  async function request(path, userId, { method = 'GET', body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const error = new Error(`notification_service_${response.status}`);
      error.code = 13;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  return { request };
}
