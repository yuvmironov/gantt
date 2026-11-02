import { describe, expect, it } from 'vitest';
import { signSyncToken, verifySyncToken } from '../src/sync-token.js';

describe('sync token', () => {
  it('signs and verifies project-scoped tokens', () => {
    const { token, expiresAt } = signSyncToken({
      userId: 'user-1',
      projectIds: ['project-1'],
      secret: 'secret',
      now: 1_000_000_000,
    });
    expect(expiresAt).toBe(1_000_300);
    expect(verifySyncToken(token, 'secret', 1_000_000_100)).toMatchObject({
      sub: 'user-1',
      projects: ['project-1'],
    });
  });

  it('rejects expired and tampered tokens', () => {
    const { token } = signSyncToken({
      userId: 'user-1',
      projectIds: ['project-1'],
      secret: 'secret',
      now: 1_000_000_000,
    });
    expect(verifySyncToken(token, 'secret', 1_000_000_301_000)).toBeNull();
    expect(verifySyncToken(`${token}x`, 'secret', 1_000_000_100)).toBeNull();
    expect(verifySyncToken(token, 'other', 1_000_000_100)).toBeNull();
  });
});
