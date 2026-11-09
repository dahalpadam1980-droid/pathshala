import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken, type AccessPayload } from '../lib/tokens.js';
import { ApiError } from '../lib/errors.js';
import { getDb } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

export interface AuthUser {
  id: string;
  role: string;
  schoolId: string | null;
  name: string;
  username: string;
  locale: string;
  status: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
      accessToken?: string;
    }
  }
}

/**
 * Route handlers are typed loosely (`any` params) so that TypeScript does not
 * pin Express route generics to ParamsDictionary — this keeps `req.params.id`
 * usable as a plain string across all module routers.
 */
export type LooseHandler = RequestHandler<any, any, any, any, any>;

/** Verifies the Bearer token AND re-checks the user is active in the database. */
export const authenticate: LooseHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized();
    let payload: AccessPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized('Session expired or invalid token');
    }
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) throw ApiError.unauthorized('Account no longer exists');
    if (user.status !== 'active') throw ApiError.forbidden('Account is disabled');
    req.auth = {
      id: user.id,
      role: user.role,
      schoolId: user.schoolId,
      name: user.nameEn,
      username: user.username,
      locale: user.locale,
      status: user.status,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Restrict a route to specific roles. */
export function requireRole(...roles: string[]): LooseHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(ApiError.forbidden(`This action requires one of these roles: ${roles.join(', ')}`));
    }
    next();
  };
}

/** School-scoped routes must belong to a school user (not super admin). */
export const requireSchool: LooseHandler = (req, _res, next) => {
  if (!req.auth) return next(ApiError.unauthorized());
  if (!req.auth.schoolId) return next(ApiError.forbidden('School context required'));
  next();
};

/** Ensure the school is not suspended. */
export const requireActiveSchool: LooseHandler = async (req, _res, next) => {
  try {
    if (!req.auth?.schoolId) return next();
    const db = await getDb();
    const { schools } = await import('../db/schema/index.js');
    const [school] = await db.select({ status: schools.status }).from(schools).where(eq(schools.id, req.auth.schoolId)).limit(1);
    if (!school) return next(ApiError.forbidden('School not found'));
    if (school.status === 'suspended') return next(ApiError.forbidden('School account is suspended. Contact the platform administrator.'));
    next();
  } catch (err) {
    next(err);
  }
};

/** Staff-only sensitive data (PAN, bank, salary) guard. */
export const requireFinanceRole: LooseHandler = (req, _res, next) => {
  const allowed = ['super_admin', 'school_admin', 'accountant'];
  if (!req.auth || !allowed.includes(req.auth.role)) {
    return next(ApiError.forbidden('Restricted financial data: requires administrator or accountant role'));
  }
  next();
};
