import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { vehicles, transportRoutes, transportAllocations, vehicleExpenses, students, classes as classTable, classes, sections } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const ALL = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher'] as const;
const MANAGE = ['super_admin', 'school_admin', 'office'] as const;

// Vehicles
router.get('/vehicles', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(vehicles)
      .where(eq(vehicles.schoolId, req.auth!.schoolId!)).orderBy(asc(vehicles.plateNo));
    const today = new Date().toISOString().slice(0, 10);
    res.json({
      ok: true,
      data: rows.map((v) => ({
        ...v,
        insuranceExpired: v.insuranceExpiry ? v.insuranceExpiry < today : false,
        fitnessExpired: v.fitnessExpiry ? v.fitnessExpiry < today : false,
      })),
    });
  } catch (err) { next(err); }
});

router.post('/vehicles', requireRole(...MANAGE), validateBody(z.object({
  plateNo: z.string().min(2).max(30),
  type: z.enum(['bus', 'van', 'car', 'micro']).default('bus'),
  model: z.string().max(120).optional().nullable(),
  capacity: z.number().int().min(1).max(200).optional().nullable(),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  fitnessExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  driverName: z.string().max(150).optional().nullable(),
  driverPhone: z.string().max(20).optional().nullable(),
  helperName: z.string().max(150).optional().nullable(),
  helperPhone: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [dupe] = await db.select({ id: vehicles.id }).from(vehicles)
      .where(and(eq(vehicles.schoolId, schoolId), eq(vehicles.plateNo, req.body.plateNo))).limit(1);
    if (dupe) throw ApiError.conflict('Vehicle with this plate number already exists');
    const [row] = await db.insert(vehicles).values({ ...req.body, schoolId }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/vehicles/:id', requireRole(...MANAGE), validateBody(z.object({
  type: z.enum(['bus', 'van', 'car', 'micro']).optional(),
  model: z.string().max(120).optional().nullable(),
  capacity: z.number().int().min(1).max(200).optional().nullable(),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  fitnessExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['active', 'maintenance', 'inactive']).optional(),
  driverName: z.string().max(150).optional().nullable(),
  driverPhone: z.string().max(20).optional().nullable(),
  helperName: z.string().max(150).optional().nullable(),
  helperPhone: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(vehicles).set(req.body)
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Vehicle not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/vehicles/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(vehicles)
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Vehicle not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// Routes
router.get('/routes', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select({
      r: transportRoutes, vehiclePlate: vehicles.plateNo,
    }).from(transportRoutes)
      .leftJoin(vehicles, eq(vehicles.id, transportRoutes.vehicleId))
      .where(eq(transportRoutes.schoolId, req.auth!.schoolId!)).orderBy(asc(transportRoutes.name));
    const allocs = await db.select().from(transportAllocations)
      .where(eq(transportAllocations.schoolId, req.auth!.schoolId!));
    res.json({
      ok: true,
      data: rows.map(({ r, vehiclePlate }) => ({
        ...r, monthlyFare: Number(r.monthlyFare), vehiclePlate,
        studentsAllocated: allocs.filter((a) => a.routeId === r.id && a.active).length,
      })),
    });
  } catch (err) { next(err); }
});

router.post('/routes', requireRole(...MANAGE), validateBody(z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  vehicleId: z.string().uuid().optional().nullable(),
  stops: z.array(z.object({
    name: z.string().max(200),
    time: z.string().max(20).default(''),
    fare: z.number().min(0).default(0),
  })).default([]),
  monthlyFare: z.number().min(0).max(1000000).default(0),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(transportRoutes).values({
      ...req.body, schoolId: req.auth!.schoolId!, monthlyFare: String(req.body.monthlyFare),
    }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/routes/:id', requireRole(...MANAGE), validateBody(z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  vehicleId: z.string().uuid().optional().nullable(),
  stops: z.array(z.object({
    name: z.string().max(200),
    time: z.string().max(20).default(''),
    fare: z.number().min(0).default(0),
  })).optional(),
  monthlyFare: z.number().min(0).max(1000000).optional(),
  active: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const body: any = { ...req.body };
    if (body.monthlyFare != null) body.monthlyFare = String(body.monthlyFare);
    const [row] = await db.update(transportRoutes).set(body)
      .where(and(eq(transportRoutes.id, req.params.id), eq(transportRoutes.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Route not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/routes/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(transportRoutes)
      .where(and(eq(transportRoutes.id, req.params.id), eq(transportRoutes.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Route not found');
    await db.delete(transportAllocations).where(eq(transportAllocations.routeId, row.id));
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// Student allocations
router.get('/allocations', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select({
      id: transportAllocations.id, routeId: transportAllocations.routeId, studentId: transportAllocations.studentId,
      stopName: transportAllocations.stopName, monthlyFare: transportAllocations.monthlyFare,
      active: transportAllocations.active,
      studentName: students.nameEn, admissionNo: students.admissionNo,
      className: classTable.name, sectionName: sections.name, rollNo: students.rollNo,
      routeName: transportRoutes.name,
    }).from(transportAllocations)
      .innerJoin(students, eq(students.id, transportAllocations.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .leftJoin(transportRoutes, eq(transportRoutes.id, transportAllocations.routeId))
      .where(eq(transportAllocations.schoolId, req.auth!.schoolId!))
      .orderBy(asc(transportRoutes.name), asc(students.rollNo));
    res.json({ ok: true, data: rows.map((r) => ({ ...r, monthlyFare: Number(r.monthlyFare) })) });
  } catch (err) { next(err); }
});

router.post('/allocations', requireRole(...MANAGE), validateBody(z.object({
  routeId: z.string().uuid(),
  studentId: z.string().uuid(),
  stopName: z.string().max(200).optional().nullable(),
  monthlyFare: z.number().min(0).max(1000000).optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [route] = await db.select().from(transportRoutes)
      .where(and(eq(transportRoutes.id, req.body.routeId), eq(transportRoutes.schoolId, schoolId))).limit(1);
    if (!route) throw ApiError.notFound('Route not found');
    const [st] = await db.select({ id: students.id }).from(students)
      .where(and(eq(students.id, req.body.studentId), eq(students.schoolId, schoolId))).limit(1);
    if (!st) throw ApiError.notFound('Student not found');
    const [dupe] = await db.select({ id: transportAllocations.id }).from(transportAllocations)
      .where(and(eq(transportAllocations.routeId, route.id), eq(transportAllocations.studentId, st.id))).limit(1);
    if (dupe) throw ApiError.conflict('Student already allocated to a route');
    const [row] = await db.insert(transportAllocations).values({
      ...req.body, schoolId, monthlyFare: String(req.body.monthlyFare ?? route.monthlyFare),
    }).returning();
    // reflect in student transport details
    await db.update(students).set({
      transport: { routeId: route.id, routeName: route.name, stopName: req.body.stopName ?? null, monthlyFare: row.monthlyFare },
    }).where(eq(students.id, st.id));
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/allocations/:id', requireRole(...MANAGE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(transportAllocations)
      .where(and(eq(transportAllocations.id, req.params.id), eq(transportAllocations.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Allocation not found');
    await db.update(students).set({ transport: {} }).where(eq(students.id, row.studentId));
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// Vehicle expenses (fuel/maintenance)
router.get('/expenses', requireRole(...(ALL as unknown as string[])), async (req, res, next) => {
  try {
    const db = await getDb();
    const filters: any[] = [eq(vehicleExpenses.schoolId, req.auth!.schoolId!)];
    if (req.query.vehicleId) filters.push(eq(vehicleExpenses.vehicleId, String(req.query.vehicleId)));
    if (req.query.type) filters.push(eq(vehicleExpenses.type, String(req.query.type)));
    if (req.query.from) filters.push(sql`${vehicleExpenses.date} >= ${String(req.query.from)}`);
    if (req.query.to) filters.push(sql`${vehicleExpenses.date} <= ${String(req.query.to)}`);
    const rows = await db.select({
      e: vehicleExpenses, plateNo: vehicles.plateNo,
    }).from(vehicleExpenses)
      .leftJoin(vehicles, eq(vehicles.id, vehicleExpenses.vehicleId))
      .where(and(...filters))
      .orderBy(desc(vehicleExpenses.date)).limit(500);
    const total = rows.reduce((s, r) => s + Number(r.e.amount), 0);
    res.json({ ok: true, data: rows.map(({ e, ...r }) => ({ ...e, amount: Number(e.amount), ...r })), meta: { total: Math.round(total * 100) / 100 } });
  } catch (err) { next(err); }
});

router.post('/expenses', requireRole(...MANAGE), validateBody(z.object({
  vehicleId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['fuel', 'maintenance', 'insurance', 'tax', 'other']).default('fuel'),
  description: z.string().max(500).optional().nullable(),
  liters: z.number().min(0).max(10000).optional().nullable(),
  odometer: z.number().int().min(0).optional().nullable(),
  amount: z.number().min(0).max(10000000),
  vendor: z.string().max(200).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [v] = await db.select({ id: vehicles.id }).from(vehicles)
      .where(and(eq(vehicles.id, req.body.vehicleId), eq(vehicles.schoolId, schoolId))).limit(1);
    if (!v) throw ApiError.notFound('Vehicle not found');
    const [row] = await db.insert(vehicleExpenses).values({
      ...req.body, schoolId, amount: String(req.body.amount),
    }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/expenses/:id', requireRole(...MANAGE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(vehicleExpenses)
      .where(and(eq(vehicleExpenses.id, req.params.id), eq(vehicleExpenses.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Expense not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

export default router;
