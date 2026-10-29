import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth.js';

describe('password hashing', () => {
  it('hashes with Argon2id and verifies', async () => {
    const passwordHash = await hashPassword('correct horse battery staple');

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(passwordHash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(passwordHash, 'wrong password')).toBe(false);
  });
});
