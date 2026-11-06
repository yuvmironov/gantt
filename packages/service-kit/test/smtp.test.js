import { describe, expect, it } from 'vitest';

import { buildSmtpUrl } from '../src/smtp.js';

describe('buildSmtpUrl', () => {
  it('uses explicit SMTP_URL when present', () => {
    expect(
      buildSmtpUrl({
        SMTP_URL: 'smtp://mailpit:1025',
        SMTP_HOST: 'smtp.jino.ru',
        SMTP_PASSWORD: 'ignored',
      }),
    ).toBe('smtp://mailpit:1025');
  });

  it('builds a STARTTLS URL from SMTP_* variables', () => {
    expect(
      buildSmtpUrl({
        SMTP_HOST: 'smtp.jino.ru',
        SMTP_PORT: '587',
        SMTP_USER: 'no-reply@app.rp-gant.ru',
        SMTP_PASSWORD: 'p@ss word',
      }),
    ).toBe('smtp://no-reply%40app.rp-gant.ru:p%40ss%20word@smtp.jino.ru:587');
  });

  it('uses SMTPS for port 465 and supports SMTP_SECURE', () => {
    expect(
      buildSmtpUrl({
        SMTP_HOST: 'smtp.jino.ru',
        SMTP_PORT: '465',
        SMTP_USER: 'user@example.com',
        SMTP_PASSWORD: 'secret',
      }),
    ).toBe('smtps://user%40example.com:secret@smtp.jino.ru:465');

    expect(
      buildSmtpUrl({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_SECURE: 'true',
      }),
    ).toBe('smtps://smtp.example.com:587');
  });

  it('returns an empty string without SMTP configuration', () => {
    expect(buildSmtpUrl({})).toBe('');
  });
});
