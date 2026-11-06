export function buildSmtpUrl(env = process.env) {
  const explicit = String(env.SMTP_URL ?? '').trim();
  if (explicit) return explicit;

  const host = String(env.SMTP_HOST ?? '').trim();
  if (!host) return '';

  const port = String(env.SMTP_PORT ?? '587').trim();
  const user = String(env.SMTP_USER ?? '').trim();
  const password = String(env.SMTP_PASSWORD ?? '');
  const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : '';
  const secure = String(env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === '465';

  return `${secure ? 'smtps' : 'smtp'}://${auth}${host}:${port}`;
}
