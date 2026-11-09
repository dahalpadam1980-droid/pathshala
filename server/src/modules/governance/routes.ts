import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { committees, committeeMembers, meetings, meetingAttendances } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const ALL = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher'] as const;
const MANAGE = ['super_admin', 'school_admin', 'office'] as const;

// Committees
router.get('/committees', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(committees)
      .where(eq(committees.schoolId, req.auth!.schoolId!)).orderBy(asc(committees.name));
    const memberRows = rows.length
      ? await db.select().from(committeeMembers).where(eq(committeeMembers.schoolId, req.auth!.schoolId!))
      : [];
    res.json({ ok: true, data: rows.map((c) => ({ ...c, members: memberRows.filter((m) => m.committeeId === c.id) })) });
  } catch (err) { next(err); }
});

router.post('/committees', requireRole(...MANAGE), validateBody(z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['smc', 'pta', 'tpa', 'other']).default('smc'),
  formedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  termEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(committees).values({ ...req.body, schoolId: req.auth!.schoolId! }).returning();
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'create', entity: 'committee', entityId: row.id, detail: { name: row.name }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/committees/:id', requireRole(...MANAGE), validateBody(z.object({
  name: z.string().min(1).max(200).optional(),
  active: z.boolean().optional(),
  description: z.string().max(2000).optional().nullable(),
  termEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(committees).set(req.body)
      .where(and(eq(committees.id, req.params.id), eq(committees.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Committee not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/committees/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(committees)
      .where(and(eq(committees.id, req.params.id), eq(committees.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Committee not found');
    await db.delete(committeeMembers).where(eq(committeeMembers.committeeId, row.id));
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// Members
router.post('/committees/:id/members', requireRole(...MANAGE), validateBody(z.object({
  name: z.string().min(1).max(150),
  nameNe: z.string().max(150).optional().nullable(),
  role: z.enum(['chair', 'vice_chair', 'secretary', 'treasurer', 'member']).default('member'),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().max(300).optional().nullable(),
  occupation: z.string().max(150).optional().nullable(),
  appointedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [committee] = await db.select().from(committees)
      .where(and(eq(committees.id, req.params.id), eq(committees.schoolId, req.auth!.schoolId!))).limit(1);
    if (!committee) throw ApiError.notFound('Committee not found');
    const [row] = await db.insert(committeeMembers).values({
      ...req.body, committeeId: committee.id, schoolId: req.auth!.schoolId!,
      email: req.body.email || null,
    }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/members/:id', requireRole(...MANAGE), validateBody(z.object({
  name: z.string().min(1).max(150).optional(),
  role: z.enum(['chair', 'vice_chair', 'secretary', 'treasurer', 'member']).optional(),
  phone: z.string().max(20).optional().nullable(),
  active: z.boolean().optional(),
  occupation: z.string().max(150).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(committeeMembers).set(req.body)
      .where(and(eq(committeeMembers.id, req.params.id), eq(committeeMembers.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Member not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/members/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(committeeMembers)
      .where(and(eq(committeeMembers.id, req.params.id), eq(committeeMembers.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Member not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// Meetings
router.get('/meetings', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select({
      m: meetings, committeeName: committees.name,
    }).from(meetings)
      .leftJoin(committees, eq(committees.id, meetings.committeeId))
      .where(eq(meetings.schoolId, req.auth!.schoolId!))
      .orderBy(desc(meetings.meetingDate)).limit(200);
    const ids = rows.map((r) => r.m.id);
    const attendance = ids.length
      ? await db.select().from(meetingAttendances).where(eq(meetingAttendances.meetingId, ids[0]))
      : [];
    void attendance;
    const allAttendance = await db.select().from(meetingAttendances);
    res.json({
      ok: true,
      data: rows.map(({ m, committeeName }) => ({
        ...m, committeeName,
        attendance: allAttendance.filter((a) => a.meetingId === m.id),
      })),
    });
  } catch (err) { next(err); }
});

router.post('/meetings', requireRole(...MANAGE), validateBody(z.object({
  committeeId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(300),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  venue: z.string().max(200).optional().nullable(),
  agenda: z.array(z.string().max(1000)).default([]),
  minutes: z.string().max(30000).optional().nullable(),
  decisions: z.array(z.object({
    text: z.string().max(2000),
    owner: z.string().max(150).optional(),
    dueDate: z.string().max(30).optional(),
    status: z.string().max(30).optional(),
  })).default([]),
  status: z.enum(['scheduled', 'held', 'cancelled']).default('scheduled'),
  attendees: z.array(z.object({ memberId: z.string().uuid(), present: z.boolean() })).default([]),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const { attendees, ...meetingBody } = req.body;
    const [row] = await db.insert(meetings).values({
      ...meetingBody, schoolId: req.auth!.schoolId!, createdBy: req.auth!.id,
    }).returning();
    if (attendees.length) {
      await db.insert(meetingAttendances).values((attendees as any[]).map((a: any) => ({
        meetingId: row.id, memberId: a.memberId, present: a.present,
      })));
    }
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'create', entity: 'meeting', entityId: row.id, detail: { title: row.title, date: row.meetingDate }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/meetings/:id', requireRole(...MANAGE), validateBody(z.object({
  title: z.string().min(1).max(300).optional(),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  venue: z.string().max(200).optional().nullable(),
  agenda: z.array(z.string().max(1000)).optional(),
  minutes: z.string().max(30000).optional().nullable(),
  decisions: z.array(z.object({
    text: z.string().max(2000),
    owner: z.string().max(150).optional(),
    dueDate: z.string().max(30).optional(),
    status: z.string().max(30).optional(),
  })).optional(),
  status: z.enum(['scheduled', 'held', 'cancelled']).optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(meetings).set(req.body)
      .where(and(eq(meetings.id, req.params.id), eq(meetings.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Meeting not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/meetings/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    await db.delete(meetingAttendances).where(eq(meetingAttendances.meetingId, req.params.id));
    const [row] = await db.delete(meetings)
      .where(and(eq(meetings.id, req.params.id), eq(meetings.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Meeting not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

export default router;
