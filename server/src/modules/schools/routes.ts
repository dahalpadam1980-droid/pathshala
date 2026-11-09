import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import {
  schools, users, students, employees, classes as classTable, sections, subjects,
  academicYears, accountHeads, feeHeads, gradingScales, gradeBands,
} from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { hashPassword, checkPasswordPolicy } from '../../lib/password.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { onboardSchool } from './onboarding.js';

const router = Router();

const schoolSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, 'Code may contain lowercase letters, numbers and hyphens'),
  nameEn: z.string().min(2).max(200),
  nameNe: z.string().max(200).optional().nullable(),
  type: z.enum(['private', 'community', 'public']).default('private'),
  levels: z.array(z.enum(['ecd', 'basic', 'secondary'])).default(['ecd', 'basic', 'secondary']),
  address: z.string().max(300).optional().nullable(),
  municipality: z.string().max(120).optional().nullable(),
  ward: z.number().int().min(0).max(35).optional().nullable(),
  district: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  registrationNo: z.string().max(100).optional().nullable(),
  emisCode: z.string().max(100).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  website: z.string().max(200).optional().nullable(),
  principalName: z.string().max(150).optional().nullable(),
  establishedDate: z.string().optional().nullable(),
  mottoEn: z.string().max(200).optional().nullable(),
  mottoNe: z.string().max(200).optional().nullable(),
  logoUrl: z.string().max(500).optional().nullable(),
  stampUrl: z.string().max(500).optional().nullable(),
  plan: z.enum(['basic', 'standard', 'premium']).default('standard'),
  branding: z.object({
    primary: z.string().max(20).optional(),
    secondary: z.string().max(20).optional(),
    accent: z.string().max(20).optional(),
  }).optional(),
});

const adminSchema = z.object({
  nameEn: z.string().min(2).max(150),
  username: z.string().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(128),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().max(20).optional().nullable(),
});

/** Public school directory (used by the login page school picker). */
router.get('/public', async (_req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db
      .select({ id: schools.id, code: schools.code, nameEn: schools.nameEn, nameNe: schools.nameNe, type: schools.type, logoUrl: schools.logoUrl })
      .from(schools)
      .where(eq(schools.status, 'active'))
      .orderBy(schools.nameEn)
      .limit(500);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

/** Public school profile for the portal / branding. */
router.get('/public/:code', async (req, res, next) => {
  try {
    const db = await getDb();
    const [school] = await db.select().from(schools).where(eq(schools.code, req.params.code)).limit(1);
    if (!school) throw ApiError.notFound('School not found');
    const { settings, ...safe } = school;
    res.json({ ok: true, data: safe });
  } catch (err) { next(err); }
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const db = await getDb();
    if (req.auth!.role === 'super_admin') {
      const rows = await db.select().from(schools).orderBy(schools.nameEn).limit(500);
      return res.json({ ok: true, data: rows });
    }
    const [row] = await db.select().from(schools).where(eq(schools.id, req.auth!.schoolId!)).limit(1);
    if (!row) throw ApiError.notFound('School not found');
    res.json({ ok: true, data: [row] });
  } catch (err) { next(err); }
});

router.get('/platform-stats', authenticate, requireRole('super_admin'), async (_req, res, next) => {
  try {
    const db = await getDb();
    const [schoolStats] = await db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${schools.status} = 'active')::int`,
      suspended: sql<number>`count(*) filter (where ${schools.status} = 'suspended')::int`,
    }).from(schools);
    const [studentStats] = await db.select({ total: sql<number>`count(*)::int` }).from(students).where(eq(students.status, 'active'));
    const [teacherStats] = await db.select({ total: sql<number>`count(*)::int` }).from(employees).where(eq(employees.status, 'active'));
    const [userStats] = await db.select({ total: sql<number>`count(*)::int` }).from(users).where(eq(users.status, 'active'));
    res.json({ ok: true, data: { schools: schoolStats, students: studentStats.total, employees: teacherStats.total, users: userStats.total } });
  } catch (err) { next(err); }
});

router.post(
  '/',
  authenticate,
  requireRole('super_admin'),
  validateBody(schoolSchema),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const [dupe] = await db.select({ id: schools.id }).from(schools).where(eq(schools.code, req.body.code)).limit(1);
      if (dupe) throw ApiError.conflict('A school with this code already exists');
      const body = { ...req.body, email: req.body.email || null, createdBy: req.auth!.id, status: 'active' as const };
      const [school] = await db.insert(schools).values(body as any).returning();
      await audit(db, { schoolId: school.id, userId: req.auth!.id, action: 'create', entity: 'school', entityId: school.id, detail: { code: school.code }, ip: req.ip });
      res.status(201).json({ ok: true, data: school });
    } catch (err) { next(err); }
  },
);

/** Register a new school WITH its administrator account (platform onboarding). */
router.post(
  '/with-admin',
  authenticate,
  requireRole('super_admin'),
  validateBody(z.object({ school: schoolSchema, admin: adminSchema })),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const { school: schoolBody, admin } = req.body;
      const policy = checkPasswordPolicy(admin.password);
      if (!policy.ok) throw ApiError.badRequest(`Admin password: ${policy.message}`);
      const [dupe] = await db.select({ id: schools.id }).from(schools).where(eq(schools.code, schoolBody.code)).limit(1);
      if (dupe) throw ApiError.conflict('A school with this code already exists');
      const [uname] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = lower(${admin.username})`).limit(1);
      if (uname) throw ApiError.conflict('Username already taken');

      const [school] = await db.insert(schools).values({ ...(schoolBody as any), email: schoolBody.email || null, createdBy: req.auth!.id }).returning();
      const [user] = await db.insert(users).values({
        schoolId: school.id, role: 'school_admin', username: admin.username,
        passwordHash: hashPassword(admin.password), nameEn: admin.nameEn,
        email: admin.email || null, phone: admin.phone ?? null, mustChangePassword: true,
      }).returning();
      await audit(db, { schoolId: school.id, userId: req.auth!.id, action: 'create', entity: 'school', entityId: school.id, detail: { code: school.code, admin: admin.username }, ip: req.ip });
      res.status(201).json({ ok: true, data: { school, admin: { id: user.id, username: user.username } } });
    } catch (err) { next(err); }
  },
);

router.patch(
  '/:id',
  authenticate,
  requireRole('super_admin', 'school_admin'),
  validateBody(schoolSchema.partial()),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const id = req.params.id;
      if (req.auth!.role !== 'super_admin' && req.auth!.schoolId !== id) throw ApiError.forbidden();
      const [existing] = await db.select().from(schools).where(eq(schools.id, id)).limit(1);
      if (!existing) throw ApiError.notFound('School not found');
      const body: any = { ...req.body, updatedAt: new Date() };
      if (body.email === '') body.email = null;
      delete body.code; // code is immutable (portal URL)
      const [row] = await db.update(schools).set(body).where(eq(schools.id, id)).returning();
      await audit(db, { schoolId: id, userId: req.auth!.id, action: 'update', entity: 'school', entityId: id, detail: body, ip: req.ip });
      res.json({ ok: true, data: row });
    } catch (err) { next(err); }
  },
);

router.post(
  '/:id/status',
  authenticate,
  requireRole('super_admin'),
  validateBody(z.object({ status: z.enum(['active', 'suspended', 'trial']), reason: z.string().max(500).optional() })),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const [row] = await db.update(schools).set({ status: req.body.status, updatedAt: new Date() })
        .where(eq(schools.id, req.params.id)).returning();
      if (!row) throw ApiError.notFound('School not found');
      await audit(db, { schoolId: row.id, userId: req.auth!.id, action: `status_${req.body.status}`, entity: 'school', entityId: row.id, detail: { reason: req.body.reason }, ip: req.ip });
      res.json({ ok: true, data: row });
    } catch (err) { next(err); }
  },
);

/**
 * Onboard a school with sensible DEFAULT configuration (all editable afterwards):
 * academic year, classes by configured levels, section A, NEB-style default grading scale,
 * government-style account heads, common fee heads.
 */
router.post(
  '/:id/onboard',
  authenticate,
  requireRole('super_admin', 'school_admin'),
  requireSchool,
  async (req, res, next) => {
    try {
      const db = await getDb();
      const schoolId = req.params.id;
      if (req.auth!.role !== 'super_admin' && req.auth!.schoolId !== schoolId) throw ApiError.forbidden();
      const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
      if (!school) throw ApiError.notFound('School not found');

      const created = await onboardSchool(schoolId);

      await audit(db, { schoolId, userId: req.auth!.id, action: 'onboard', entity: 'school', entityId: schoolId, detail: created, ip: req.ip });
      res.json({ ok: true, data: { created } });
    } catch (err) { next(err); }
  },
);

/** Platform-wide audit log viewer (super admin). */
router.get('/audit-logs', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const { auditLogs } = await import('../../db/schema/index.js');
    const rows = await db.select().from(auditLogs)
      .where(req.query.schoolId ? eq(auditLogs.schoolId, String(req.query.schoolId)) : undefined)
      .orderBy(sql`created_at desc`)
      .limit(200);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

export default router;
