import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { employees, leaves, serviceRecords, trainings } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool, requireFinanceRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const READ = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher'] as const;
const WRITE = ['super_admin', 'school_admin', 'office'] as const;

const APPOINTMENT_TYPES = ['permanent', 'temporary', 'contract', 'rahat', 'private_source', 'grant_supported', 'other'] as const;

const employeeSchema = z.object({
  empCode: z.string().min(1).max(40).optional(),
  nameEn: z.string().min(1).max(150),
  nameNe: z.string().max(150).optional().nullable(),
  photoUrl: z.string().max(500).optional().nullable(),
  gender: z.enum(['male', 'female', 'other']).optional().nullable(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().max(300).optional().nullable(),
  municipality: z.string().max(120).optional().nullable(),
  ward: z.number().int().min(0).max(35).optional().nullable(),
  district: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  appointmentType: z.enum(APPOINTMENT_TYPES).default('permanent'),
  designation: z.string().max(120).optional().nullable(),
  level: z.string().max(30).optional().nullable(),
  subjectSpecialization: z.string().max(200).optional().nullable(),
  teachingLicense: z.string().max(100).optional().nullable(),
  isTeacher: z.boolean().default(true),
  bankName: z.string().max(120).optional().nullable(),
  bankAccount: z.string().max(50).optional().nullable(),
  panNo: z.string().max(30).optional().nullable(),
  status: z.enum(['active', 'suspended', 'retired', 'resigned']).default('active'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  qualification: z.array(z.object({ degree: z.string().max(120), board: z.string().max(120), year: z.number().int() })).default([]),
});

/** Strip restricted financial fields unless caller is admin/accountant. */
function maskEmployee(row: any, role: string) {
  if (['super_admin', 'school_admin', 'accountant'].includes(role)) return row;
  const { panNo, bankAccount, bankName, ...safe } = row;
  return { ...safe, panNo: null, bankAccount: null, bankName: null, restricted: true };
}

router.get('/', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));
    const q = (req.query.q as string | undefined)?.trim();

    const filters: any[] = [eq(employees.schoolId, schoolId)];
    if (req.query.status) filters.push(eq(employees.status, String(req.query.status)));
    if (req.query.isTeacher !== undefined && req.query.isTeacher !== '') {
      filters.push(eq(employees.isTeacher, req.query.isTeacher === 'true'));
    }
    if (req.query.appointmentType) filters.push(eq(employees.appointmentType, String(req.query.appointmentType)));
    if (q) filters.push(sql`(${employees.nameEn} ILIKE ${'%' + q + '%'} OR ${employees.nameNe} ILIKE ${'%' + q + '%'} OR ${employees.empCode} ILIKE ${'%' + q + '%'} OR ${employees.designation} ILIKE ${'%' + q + '%'})`);
    const where = and(...filters);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(employees).where(where);
    const rows = await db.select().from(employees).where(where)
      .orderBy(asc(employees.nameEn)).limit(pageSize).offset((page - 1) * pageSize);

    const [summary] = await db.select({
      total: sql<number>`count(*)::int`,
      teachers: sql<number>`count(*) filter (where ${employees.isTeacher} and ${employees.status} = 'active')::int`,
      permanent: sql<number>`count(*) filter (where ${employees.appointmentType} = 'permanent' and ${employees.status} = 'active')::int`,
    }).from(employees).where(eq(employees.schoolId, schoolId));

    res.json({ ok: true, data: rows.map((r) => maskEmployee(r, req.auth!.role)), meta: { page, pageSize, total: count, pages: Math.max(1, Math.ceil(count / pageSize)), summary } });
  } catch (err) { next(err); }
});

router.get('/:id', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.select().from(employees)
      .where(and(eq(employees.id, req.params.id), eq(employees.schoolId, req.auth!.schoolId!))).limit(1);
    if (!row) throw ApiError.notFound('Employee not found');
    const [svc, trn] = await Promise.all([
      db.select().from(serviceRecords).where(eq(serviceRecords.employeeId, row.id)).orderBy(desc(serviceRecords.recordDate)),
      db.select().from(trainings).where(eq(trainings.employeeId, row.id)).orderBy(desc(trainings.fromDate)),
    ]);
    res.json({ ok: true, data: { ...maskEmployee(row, req.auth!.role), serviceRecords: svc, trainings: trn } });
  } catch (err) { next(err); }
});

async function nextEmpCode(schoolId: string): Promise<string> {
  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(employees).where(eq(employees.schoolId, schoolId));
  let n = count + 1;
  for (let i = 0; i < 20; i++) {
    const candidate = `EMP-${String(n).padStart(4, '0')}`;
    const [dupe] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.schoolId, schoolId), eq(employees.empCode, candidate))).limit(1);
    if (!dupe) return candidate;
    n++;
  }
  return `EMP-${Date.now()}`;
}

router.post('/', requireRole(...WRITE), validateBody(employeeSchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const body: any = { ...req.body, schoolId };
    if (body.email === '') body.email = null;
    if (!body.empCode) body.empCode = await nextEmpCode(schoolId);
    const [dupe] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.schoolId, schoolId), eq(employees.empCode, body.empCode))).limit(1);
    if (dupe) throw ApiError.conflict(`Employee code ${body.empCode} already exists`);
    const [row] = await db.insert(employees).values(body).returning();
    if (req.body.appointmentDate) {
      await db.insert(serviceRecords).values({
        schoolId, employeeId: row.id, recordDate: req.body.appointmentDate,
        type: 'appointment', details: `Appointed as ${req.body.designation ?? 'staff'} (${req.body.appointmentType})`,
        createdBy: req.auth!.id,
      });
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'employee', entityId: row.id, detail: { empCode: row.empCode, nameEn: row.nameEn }, ip: req.ip });
    res.status(201).json({ ok: true, data: maskEmployee(row, req.auth!.role) });
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(...WRITE), validateBody(employeeSchema.partial()), async (req, res, next) => {
  try {
    const db = await getDb();
    const body: any = { ...req.body, updatedAt: new Date() };
    if (body.email === '') body.email = null;
    delete body.schoolId; delete body.empCode;
    const [row] = await db.update(employees).set(body)
      .where(and(eq(employees.id, req.params.id), eq(employees.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Employee not found');
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'update', entity: 'employee', entityId: row.id, detail: body, ip: req.ip });
    res.json({ ok: true, data: maskEmployee(row, req.auth!.role) });
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(employees)
      .where(and(eq(employees.id, req.params.id), eq(employees.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Employee not found');
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'delete', entity: 'employee', entityId: row.id, detail: { empCode: row.empCode }, ip: req.ip });
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ---------------- Leaves ----------------
const leaveSchema = z.object({
  employeeId: z.string().uuid(),
  leaveType: z.enum(['casual', 'sick', 'earned', 'maternity', 'study', 'other']).default('casual'),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(1000).optional().nullable(),
});

router.get('/leaves/list', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const filters: any[] = [eq(leaves.schoolId, req.auth!.schoolId!)];
    if (req.query.status) filters.push(eq(leaves.status, String(req.query.status)));
    if (req.query.employeeId) filters.push(eq(leaves.employeeId, String(req.query.employeeId)));
    // teachers can see only their own
    if (req.auth!.role === 'teacher') {
      const [mine] = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, req.auth!.id)).limit(1);
      filters.push(eq(leaves.employeeId, mine?.id ?? '00000000-0000-0000-0000-000000000000'));
    }
    const rows = await db
      .select({
        id: leaves.id, employeeId: leaves.employeeId, leaveType: leaves.leaveType,
        fromDate: leaves.fromDate, toDate: leaves.toDate, days: leaves.days,
        reason: leaves.reason, status: leaves.status, remarks: leaves.remarks,
        createdAt: leaves.createdAt, employeeName: employees.nameEn, empCode: employees.empCode,
      })
      .from(leaves)
      .leftJoin(employees, eq(employees.id, leaves.employeeId))
      .where(and(...filters))
      .orderBy(desc(leaves.createdAt)).limit(300);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

router.post('/leaves', requireRole(...READ), validateBody(leaveSchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, req.body.employeeId), eq(employees.schoolId, schoolId))).limit(1);
    if (!emp) throw ApiError.notFound('Employee not found');
    // A teacher may only apply for themselves
    if (req.auth!.role === 'teacher' && emp.userId !== req.auth!.id) {
      throw ApiError.forbidden('You can only apply for leave for yourself');
    }
    const [row] = await db.insert(leaves).values({
      schoolId, ...req.body, days: daysBetween(req.body.fromDate, req.body.toDate),
      status: 'pending',
    }).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'leave', entityId: row.id, detail: { employeeId: emp.id, type: req.body.leaveType }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.post('/leaves/:id/review', requireRole(...WRITE), validateBody(z.object({
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().max(500).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [existing] = await db.select().from(leaves)
      .where(and(eq(leaves.id, req.params.id), eq(leaves.schoolId, schoolId))).limit(1);
    if (!existing) throw ApiError.notFound('Leave application not found');
    if (existing.status !== 'pending') throw ApiError.badRequest(`Leave already ${existing.status}`);
    const [row] = await db.update(leaves).set({
      status: req.body.decision, remarks: req.body.remarks ?? null, reviewedBy: req.auth!.id, reviewedAt: new Date(),
    }).where(eq(leaves.id, existing.id)).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: `leave_${req.body.decision}`, entity: 'leave', entityId: row.id, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

// ---------------- Service records & trainings ----------------
router.post('/:id/service-records', requireRole(...WRITE), validateBody(z.object({
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['appointment', 'promotion', 'increment', 'transfer', 'training', 'retirement', 'other']),
  details: z.string().max(2000),
  meta: z.record(z.string(), z.unknown()).optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(serviceRecords).values({
      schoolId: req.auth!.schoolId!, employeeId: req.params.id, ...req.body,
      meta: req.body.meta ?? {}, createdBy: req.auth!.id,
    }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/service-records/:recordId', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(serviceRecords)
      .where(and(eq(serviceRecords.id, req.params.recordId), eq(serviceRecords.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Record not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

router.post('/:id/trainings', requireRole(...WRITE), validateBody(z.object({
  title: z.string().min(1).max(300),
  provider: z.string().max(200).optional().nullable(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  hours: z.number().int().min(0).optional().nullable(),
  certificateNo: z.string().max(100).optional().nullable(),
  remarks: z.string().max(1000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(trainings).values({ schoolId: req.auth!.schoolId!, employeeId: req.params.id, ...req.body }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/trainings/:trainingId', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(trainings)
      .where(and(eq(trainings.id, req.params.trainingId), eq(trainings.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Training not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

/** PAN/bank details — strictly limited to finance roles. */
router.get('/:id/salary-details', requireFinanceRole, async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.select({
      id: employees.id, empCode: employees.empCode, nameEn: employees.nameEn,
      panNo: employees.panNo, bankName: employees.bankName, bankAccount: employees.bankAccount,
      salaryScale: employees.salaryScale, appointmentType: employees.appointmentType,
    }).from(employees)
      .where(and(eq(employees.id, req.params.id), eq(employees.schoolId, req.auth!.schoolId!))).limit(1);
    if (!row) throw ApiError.notFound('Employee not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

export default router;
