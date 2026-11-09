import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { users, students, employees } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { hashPassword, checkPasswordPolicy } from '../../lib/password.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate);

const ROLES = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'] as const;

const createSchema = z.object({
  role: z.enum(ROLES),
  username: z.string().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/, 'Username may contain letters, numbers, dot, underscore and hyphen'),
  password: z.string().min(8).max(128),
  nameEn: z.string().min(1).max(150),
  nameNe: z.string().max(150).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().max(20).optional().nullable(),
  locale: z.enum(['en', 'ne']).default('en'),
  studentId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  mustChangePassword: z.boolean().default(true),
});

const updateSchema = z.object({
  nameEn: z.string().min(1).max(150).optional(),
  nameNe: z.string().max(150).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().max(20).optional().nullable(),
  locale: z.enum(['en', 'ne']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  role: z.enum(ROLES).optional(),
  photoUrl: z.string().max(500).optional().nullable(),
});

router.get(
  '/',
  requireRole('super_admin', 'school_admin', 'office'),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const scope = req.auth!.role === 'super_admin' && req.query.schoolId ? String(req.query.schoolId) : req.auth!.schoolId;
      const rows = await db
        .select({
          id: users.id, role: users.role, username: users.username, email: users.email, phone: users.phone,
          nameEn: users.nameEn, nameNe: users.nameNe, status: users.status, locale: users.locale,
          photoUrl: users.photoUrl, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
          studentId: students.id, employeeId: employees.id,
        })
        .from(users)
        .leftJoin(students, eq(students.userId, users.id))
        .leftJoin(employees, eq(employees.userId, users.id))
        .where(scope ? eq(users.schoolId, scope) : undefined)
        .orderBy(sql`users.created_at desc`)
        .limit(500);
      res.json({ ok: true, data: rows });
    } catch (err) { next(err); }
  },
);

router.post(
  '/',
  requireRole('super_admin', 'school_admin', 'office'),
  requireSchool,
  requireActiveSchool,
  validateBody(createSchema),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const body = req.body;
      const policy = checkPasswordPolicy(body.password);
      if (!policy.ok) throw ApiError.badRequest(policy.message!);
      if (req.auth!.role === 'office' && ['super_admin', 'school_admin', 'accountant'].includes(body.role)) {
        throw ApiError.forbidden('Office staff can only create teacher, student and parent accounts');
      }
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${body.username})`)
        .limit(1);
      if (existing) throw ApiError.conflict('This username is already taken');

      const [row] = await db
        .insert(users)
        .values({
          schoolId: req.auth!.schoolId,
          role: body.role,
          username: body.username,
          passwordHash: hashPassword(body.password),
          nameEn: body.nameEn,
          nameNe: body.nameNe ?? null,
          email: body.email || null,
          phone: body.phone ?? null,
          locale: body.locale,
          mustChangePassword: body.mustChangePassword,
        })
        .returning({ id: users.id });

      // Link to student / employee profile when provided
      if (body.studentId) await db.update(students).set({ userId: row.id }).where(eq(students.id, body.studentId));
      if (body.employeeId) await db.update(employees).set({ userId: row.id }).where(eq(employees.id, body.employeeId));

      await audit(db, {
        schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'create',
        entity: 'user', entityId: row.id, detail: { username: body.username, role: body.role }, ip: req.ip,
      });
      const [created] = await db.select().from(users).where(eq(users.id, row.id)).limit(1);
      res.status(201).json({ ok: true, data: { ...publicUser(created) } });
    } catch (err) { next(err); }
  },
);

router.patch(
  '/:id',
  requireRole('super_admin', 'school_admin', 'office'),
  requireSchool,
  validateBody(updateSchema),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const [existing] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!existing || existing.schoolId !== req.auth!.schoolId) throw ApiError.notFound('User not found');
      if (req.auth!.role === 'office' && ['super_admin', 'school_admin', 'accountant'].includes(existing.role)) {
        throw ApiError.forbidden('You cannot modify administrator accounts');
      }
      const body = { ...req.body, updatedAt: new Date() } as any;
      if (body.email === '') body.email = null;
      const [row] = await db.update(users).set(body).where(eq(users.id, req.params.id)).returning();
      await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'update', entity: 'user', entityId: row.id, detail: body, ip: req.ip });
      res.json({ ok: true, data: publicUser(row) });
    } catch (err) { next(err); }
  },
);

const resetSchema = z.object({ newPassword: z.string().min(8).max(128), forceChange: z.boolean().default(true) });

router.post(
  '/:id/reset-password',
  requireRole('super_admin', 'school_admin'),
  requireSchool,
  validateBody(resetSchema),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const policy = checkPasswordPolicy(req.body.newPassword);
      if (!policy.ok) throw ApiError.badRequest(policy.message!);
      const [existing] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!existing || existing.schoolId !== req.auth!.schoolId) throw ApiError.notFound('User not found');
      await db
        .update(users)
        .set({ passwordHash: hashPassword(req.body.newPassword), mustChangePassword: req.body.forceChange, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, req.params.id));
      await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'reset_password', entity: 'user', entityId: req.params.id, ip: req.ip });
      res.json({ ok: true, data: { reset: true } });
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:id',
  requireRole('super_admin', 'school_admin'),
  requireSchool,
  async (req, res, next) => {
    try {
      const db = await getDb();
      const [existing] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!existing || existing.schoolId !== req.auth!.schoolId) throw ApiError.notFound('User not found');
      if (existing.id === req.auth!.id) throw ApiError.badRequest('You cannot delete your own account');
      if (existing.role === 'school_admin') {
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users)
          .where(and(eq(users.schoolId, req.auth!.schoolId!), eq(users.role, 'school_admin'), eq(users.status, 'active')));
        if (count <= 1) throw ApiError.badRequest('The school must have at least one active administrator');
      }
      await db.update(users).set({ status: 'inactive', updatedAt: new Date() }).where(eq(users.id, req.params.id));
      await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'deactivate', entity: 'user', entityId: req.params.id, ip: req.ip });
      res.json({ ok: true, data: { id: req.params.id, deactivated: true } });
    } catch (err) { next(err); }
  },
);

function publicUser(u: typeof users.$inferSelect) {
  const { passwordHash, ...rest } = u;
  return rest;
}

export default router;
