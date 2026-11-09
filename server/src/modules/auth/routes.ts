import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { users, refreshTokens, loginHistory, schools } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { hashPassword, verifyPassword, checkPasswordPolicy } from '../../lib/password.js';
import { signAccessToken, generateRefreshToken, hashToken } from '../../lib/tokens.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { audit } from '../../lib/audit.js';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(128),
  schoolCode: z.string().max(100).optional(),
});

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

router.post(
  '/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 40, keyPrefix: 'login' }),
  validateBody(loginSchema),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const { username, password } = req.body;
      const identifier = username.trim();

      const [user] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.username}) = lower(${identifier}) OR lower(coalesce(${users.email},'')) = lower(${identifier})`)
        .limit(1);

      const userAgent = req.headers['user-agent'] ?? null;
      const ip = req.ip ?? null;

      const fail = async (reason: string) => {
        await db.insert(loginHistory).values({ userId: user?.id ?? null, schoolId: user?.schoolId ?? null, success: false, reason, ip, userAgent });
        throw ApiError.unauthorized(reason);
      };

      if (!user) return await fail('Invalid username or password');
      if (user.status !== 'active') return await fail('Account is disabled. Contact your administrator.');
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
        return await fail(`Account locked due to repeated failed attempts. Try again in ${mins} minute(s).`);
      }

      if (!verifyPassword(password, user.passwordHash)) {
        const attempts = (user.failedAttempts ?? 0) + 1;
        const lockUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;
        await db
          .update(users)
          .set({ failedAttempts: attempts, lockedUntil: lockUntil, updatedAt: new Date() })
          .where(eq(users.id, user.id));
        return await fail('Invalid username or password');
      }

      // Optional: school must be active
      if (user.schoolId) {
        const [school] = await db.select({ status: schools.status, nameEn: schools.nameEn }).from(schools).where(eq(schools.id, user.schoolId)).limit(1);
        if (!school) return await fail('School account not found');
        if (school.status === 'suspended') return await fail('School account is suspended. Contact the platform administrator.');
      }

      const accessToken = signAccessToken({
        sub: user.id,
        role: user.role,
        schoolId: user.schoolId,
        name: user.nameEn,
        username: user.username,
      });
      const refresh = generateRefreshToken();
      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: refresh.hash,
        expiresAt: refresh.expiresAt,
        ip,
        userAgent,
      });
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await db.insert(loginHistory).values({ userId: user.id, schoolId: user.schoolId, success: true, ip, userAgent });

      res.json({
        ok: true,
        data: {
          accessToken,
          refreshToken: refresh.token,
          user: publicUser(user),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

router.post('/refresh', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const tokenHash = hashToken(req.body.refreshToken);
    const [row] = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
      .limit(1);
    if (!row) throw ApiError.unauthorized('Invalid or expired refresh token');

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user || user.status !== 'active') throw ApiError.unauthorized('Account is no longer active');

    // rotate: revoke old, issue new
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    const refresh = generateRefreshToken();
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId,
      name: user.nameEn,
      username: user.username,
    });
    res.json({ ok: true, data: { accessToken, refreshToken: refresh.token, user: publicUser(user) } });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const db = await getDb();
    const token = req.body?.refreshToken;
    if (token) {
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, hashToken(token)));
    }
    res.json({ ok: true, data: { loggedOut: true } });
  } catch (err) {
    next(err);
  }
});

/** Current session profile (incl. school branding for the UI). */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.id)).limit(1);
    if (!user) throw ApiError.unauthorized();
    let school = null;
    if (user.schoolId) {
      [school] = await db.select().from(schools).where(eq(schools.id, user.schoolId)).limit(1);
    }
    res.json({ ok: true, data: { user: publicUser(user), school } });
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

router.post('/change-password', authenticate, validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.id)).limit(1);
    if (!user) throw ApiError.unauthorized();
    if (!verifyPassword(req.body.currentPassword, user.passwordHash)) {
      throw ApiError.badRequest('Current password is incorrect');
    }
    const policy = checkPasswordPolicy(req.body.newPassword);
    if (!policy.ok) throw ApiError.badRequest(policy.message!);
    if (req.body.newPassword === req.body.currentPassword) {
      throw ApiError.badRequest('New password must be different from the current password');
    }
    await db
      .update(users)
      .set({ passwordHash: hashPassword(req.body.newPassword), mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await audit(db, { schoolId: user.schoolId, userId: user.id, action: 'change_password', entity: 'user', entityId: user.id, ip: req.ip });
    res.json({ ok: true, data: { changed: true } });
  } catch (err) {
    next(err);
  }
});

/** Login history for the current user (security transparency). */
router.get('/login-history', authenticate, async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: loginHistory.id,
        success: loginHistory.success,
        reason: loginHistory.reason,
        ip: loginHistory.ip,
        userAgent: loginHistory.userAgent,
        createdAt: loginHistory.createdAt,
      })
      .from(loginHistory)
      .where(eq(loginHistory.userId, req.auth!.id))
      .orderBy(sql`created_at desc`)
      .limit(50);
    res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
});

/** Admin: list accounts of a school (user management). */
router.get('/accounts', authenticate, requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const scope = req.auth!.role === 'super_admin' && !req.query.schoolId ? null : req.auth!.schoolId;
    const rows = await db
      .select({
        id: users.id,
        role: users.role,
        username: users.username,
        email: users.email,
        phone: users.phone,
        nameEn: users.nameEn,
        nameNe: users.nameNe,
        status: users.status,
        locale: users.locale,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        schoolId: users.schoolId,
      })
      .from(users)
      .where(scope ? eq(users.schoolId, scope) : req.query.schoolId ? eq(users.schoolId, String(req.query.schoolId)) : undefined)
      .orderBy(sql`created_at desc`)
      .limit(500);
    res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
});

function publicUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    role: u.role,
    username: u.username,
    email: u.email,
    phone: u.phone,
    nameEn: u.nameEn,
    nameNe: u.nameNe,
    photoUrl: u.photoUrl,
    locale: u.locale,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
    schoolId: u.schoolId,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export default router;
export { hashPassword, checkPasswordPolicy, publicUser };
