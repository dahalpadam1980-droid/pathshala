import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

export interface AccessPayload {
  sub: string; // user id
  role: string;
  schoolId: string | null;
  name: string;
  username: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.accessTokenTtl,
    issuer: 'pathshala-erp',
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.jwtSecret, { issuer: 'pathshala-erp' }) as jwt.JwtPayload;
  return {
    sub: String(decoded.sub),
    role: String(decoded.role),
    schoolId: (decoded.schoolId as string | null) ?? null,
    name: String(decoded.name ?? ''),
    username: String(decoded.username ?? ''),
  };
}

/** Opaque refresh token; only its SHA-256 hash is persisted. */
export function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.refreshTokenTtl * 1000);
  return { token, hash: hashToken(token), expiresAt };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
