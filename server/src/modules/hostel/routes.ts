import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { hostels, hostelRooms, hostelAllocations, hostelComplaints, students, classes as classTable } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const ALL = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher'] as const;
const MANAGE = ['super_admin', 'school_admin', 'office'] as const;

router.get('/', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const hostelRows = await db.select().from(hostels).where(eq(hostels.schoolId, schoolId)).orderBy(asc(hostels.name));
    const roomRows = await db.select().from(hostelRooms).where(eq(hostelRooms.schoolId, schoolId));
    const allocRows = await db.select().from(hostelAllocations).where(eq(hostelAllocations.schoolId, schoolId));
    const studentRows = allocRows.length
      ? await db.select({ id: students.id, nameEn: students.nameEn, admissionNo: students.admissionNo, className: classTable.name })
        .from(students).leftJoin(classTable, eq(classTable.id, students.classId))
        .where(sql`${students.id} in (${sql.join(allocRows.map((a) => sql`${a.studentId}`), sql`, `)})`)
      : [];
    res.json({
      ok: true,
      data: hostelRows.map((h) => {
        const rooms = roomRows.filter((r) => r.hostelId === h.id);
        return {
          ...h,
          rooms: rooms.map((r) => ({
            ...r,
            allocations: allocRows.filter((a) => a.roomId === r.id && a.active).map((a) => ({
              ...a,
              student: studentRows.find((s) => s.id === a.studentId) ?? null,
            })),
          })),
          occupancy: rooms.reduce((s, r) => s + r.occupied, 0),
          capacity: rooms.reduce((s, r) => s + r.capacity, 0),
        };
      }),
    });
  } catch (err) { next(err); }
});

router.post('/', requireRole(...MANAGE), validateBody(z.object({
  name: z.string().min(1).max(200),
  warden: z.string().max(150).optional().nullable(),
  capacity: z.number().int().min(0).max(5000).default(0),
  description: z.string().max(2000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(hostels).values({ ...req.body, schoolId: req.auth!.schoolId! }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(...MANAGE), validateBody(z.object({
  name: z.string().min(1).max(200).optional(),
  warden: z.string().max(150).optional().nullable(),
  capacity: z.number().int().min(0).max(5000).optional(),
  description: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(hostels).set(req.body)
      .where(and(eq(hostels.id, req.params.id), eq(hostels.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Hostel not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(hostels)
      .where(and(eq(hostels.id, req.params.id), eq(hostels.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Hostel not found');
    const rooms = await db.select({ id: hostelRooms.id }).from(hostelRooms).where(eq(hostelRooms.hostelId, row.id));
    for (const r of rooms) await db.delete(hostelAllocations).where(eq(hostelAllocations.roomId, r.id));
    await db.delete(hostelRooms).where(eq(hostelRooms.hostelId, row.id));
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

router.post('/:id/rooms', requireRole(...MANAGE), validateBody(z.object({
  roomNo: z.string().min(1).max(40),
  capacity: z.number().int().min(1).max(50).default(4),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [hostel] = await db.select().from(hostels)
      .where(and(eq(hostels.id, req.params.id), eq(hostels.schoolId, schoolId))).limit(1);
    if (!hostel) throw ApiError.notFound('Hostel not found');
    const [row] = await db.insert(hostelRooms).values({
      hostelId: hostel.id, schoolId, roomNo: req.body.roomNo, capacity: req.body.capacity,
    }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.post('/rooms/:roomId/allocate', requireRole(...MANAGE), validateBody(z.object({
  studentId: z.string().uuid(),
  bedNo: z.string().max(20).optional().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [room] = await db.select().from(hostelRooms)
      .where(and(eq(hostelRooms.id, req.params.roomId), eq(hostelRooms.schoolId, schoolId))).limit(1);
    if (!room) throw ApiError.notFound('Room not found');
    if (room.occupied >= room.capacity) throw ApiError.badRequest('Room is full');
    const [st] = await db.select({ id: students.id }).from(students)
      .where(and(eq(students.id, req.body.studentId), eq(students.schoolId, schoolId))).limit(1);
    if (!st) throw ApiError.notFound('Student not found');
    const [dupe] = await db.select({ id: hostelAllocations.id }).from(hostelAllocations)
      .where(and(eq(hostelAllocations.roomId, room.id), eq(hostelAllocations.studentId, st.id), eq(hostelAllocations.active, true))).limit(1);
    if (dupe) throw ApiError.conflict('Student already allocated to this room');
    const [row] = await db.insert(hostelAllocations).values({
      ...req.body, schoolId, roomId: room.id,
    }).returning();
    await db.update(hostelRooms).set({ occupied: room.occupied + 1 }).where(eq(hostelRooms.id, room.id));
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/allocations/:id', requireRole(...MANAGE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(hostelAllocations)
      .where(and(eq(hostelAllocations.id, req.params.id), eq(hostelAllocations.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Allocation not found');
    const [room] = await db.select().from(hostelRooms).where(eq(hostelRooms.id, row.roomId)).limit(1);
    if (room) await db.update(hostelRooms).set({ occupied: Math.max(0, room.occupied - 1) }).where(eq(hostelRooms.id, room.id));
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// Complaints
router.get('/complaints', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select({
      c: hostelComplaints, studentName: students.nameEn,
    }).from(hostelComplaints)
      .leftJoin(students, eq(students.id, hostelComplaints.studentId))
      .where(eq(hostelComplaints.schoolId, req.auth!.schoolId!))
      .orderBy(sql`created_at desc`).limit(200);
    res.json({ ok: true, data: rows.map(({ c, studentName }) => ({ ...c, studentName })) });
  } catch (err) { next(err); }
});

router.post('/complaints', requireRole(...(ALL as unknown as string[])), validateBody(z.object({
  body: z.string().min(1).max(3000),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    let studentId: string | null = null;
    if (req.auth!.role === 'student') {
      const [me] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.schoolId, schoolId), eq(students.userId, req.auth!.id))).limit(1);
      studentId = me?.id ?? null;
    }
    const [row] = await db.insert(hostelComplaints).values({
      schoolId, body: req.body.body, studentId,
    }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/complaints/:id', requireRole(...MANAGE), validateBody(z.object({
  status: z.enum(['open', 'in_progress', 'resolved']),
  resolution: z.string().max(2000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(hostelComplaints).set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(hostelComplaints.id, req.params.id), eq(hostelComplaints.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Complaint not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

export default router;
