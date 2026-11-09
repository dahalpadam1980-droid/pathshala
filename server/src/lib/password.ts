import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 64;

/** Password hashing with scrypt (Node built-in, memory-hard, no native deps). */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(plain, salt, expected.length);
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export interface PasswordIssue {
  ok: boolean;
  message?: string;
}

/** Strong password policy enforced on create/reset. */
export function checkPasswordPolicy(password: string): PasswordIssue {
  if (password.length < 8) return { ok: false, message: 'Password must be at least 8 characters long' };
  if (!/[a-zA-Z]/.test(password)) return { ok: false, message: 'Password must contain at least one letter' };
  if (!/[0-9]/.test(password)) return { ok: false, message: 'Password must contain at least one number' };
  if (password.length > 128) return { ok: false, message: 'Password is too long' };
  return { ok: true };
}
