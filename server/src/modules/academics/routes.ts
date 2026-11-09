import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { classes, sections, subjects, classSubjects, subjectAssignments, routines, schoolEvents } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { crudRouter } from '../../core/crud.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const round1 = (n: number) => Math.round(n * 10) / 10;

const READ = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'] as const;
const WRITE = ['super_admin', 'school_admin', 'office'] as const;

// ---------------- Classes ----------------
router.use(
  '/classes',
  crudRouter({
    table: classes,
    entity: 'class',
    createSchema: z.object({
      name: z.string().min(1).max(60),
      nameNe: z.string().max(60).optional().nullable(),
      level: z.enum(['ecd', 'basic', 'secondary']).default('basic'),
      orderIndex: z.number().int().default(0),
      optionalCount: z.coerce.number().int().min(0).max(10).default(0),
    }),
    searchFields: ['name', 'nameNe'],
    orderBy: 'orderIndex',
    order: 'asc',
    roles: [...READ],
    createRoles: [...WRITE],
    updateRoles: [...WRITE],
    deleteRoles: ['super_admin', 'school_admin'],
  }),
);

// ---------------- Sections ----------------
router.use(
  '/sections',
  crudRouter({
    table: sections,
    entity: 'section',
    createSchema: z.object({
      classId: z.string().uuid(),
      name: z.string().min(1).max(30),
      classTeacherId: z.string().uuid().optional().nullable(),
      room: z.string().max(60).optional().nullable(),
      capacity: z.number().int().min(0).optional().nullable(),
    }),
    searchFields: ['name', 'room'],
    orderBy: 'name',
    order: 'asc',
    roles: [...READ],
    createRoles: [...WRITE],
    updateRoles: [...WRITE],
    deleteRoles: ['super_admin', 'school_admin'],
  }),
);

// ---------------- Subjects ----------------
router.use(
  '/subjects',
  crudRouter({
    table: subjects,
    entity: 'subject',
    createSchema: z.object({
      code: z.string().max(30).optional().nullable(),
      nameEn: z.string().min(1).max(120),
      nameNe: z.string().max(120).optional().nullable(),
      type: z.enum(['compulsory', 'optional', 'elective']).default('compulsory'),
      creditHours: z.coerce.string().regex(/^\d+(\.\d+)?$/, 'Credit hours must be a number').default('0'),
      hasPractical: z.boolean().default(false),
      description: z.string().max(1000).optional().nullable(),
    }),
    searchFields: ['nameEn', 'nameNe', 'code'],
    orderBy: 'nameEn',
    order: 'asc',
    roles: [...READ],
    createRoles: [...WRITE],
    updateRoles: [...WRITE],
    deleteRoles: ['super_admin', 'school_admin'],
  }),
);

// ---------------- Class-Subject mapping (mark config) ----------------
router.use(
  '/class-subjects',
  crudRouter({
    table: classSubjects,
    entity: 'class_subject',
    createSchema: z.object({
      classId: z.string().uuid(),
      subjectId: z.string().uuid(),
      isCompulsory: z.boolean().default(true),
      theoryFull: z.number().int().min(0).max(200).default(75),
      theoryPass: z.number().int().min(0).max(200).default(24),
      // Practical was replaced by INTERNAL — new rows use the Theory + Internal split.
      practicalFull: z.number().int().min(0).max(200).default(0),
      practicalPass: z.number().int().min(0).max(200).default(0),
      internalFull: z.number().int().min(0).max(200).default(25),
      internalPass: z.number().int().min(0).max(200).default(9),
      theoryCreditHours: z.coerce.string().regex(/^\d+(\.\d+)?$/).default('0'),
      internalCreditHours: z.coerce.string().regex(/^\d+(\.\d+)?$/).default('0'),
      orderIndex: z.number().int().default(0),
    }),
    /** Keep the total credit hours in sync (GPA weighting uses creditHours). */
    beforeCreate: (ctx) => ({
      ...ctx.body,
      creditHours: String(
        round1(Number(ctx.body?.theoryCreditHours ?? 0) + Number(ctx.body?.internalCreditHours ?? 0)),
      ),
    }),
    beforeUpdate: (ctx) => {
      const body = { ...ctx.body };
      if (body.theoryCreditHours !== undefined || body.internalCreditHours !== undefined) {
        const theory = Number(body.theoryCreditHours ?? ctx.existing?.theoryCreditHours ?? 0);
        const internal = Number(body.internalCreditHours ?? ctx.existing?.internalCreditHours ?? 0);
        body.creditHours = String(round1(theory + internal));
      }
      return body;
    },
    searchFields: [],
    orderBy: 'orderIndex',
    order: 'asc',
    roles: [...READ],
    createRoles: [...WRITE],
    updateRoles: [...WRITE],
    deleteRoles: ['super_admin', 'school_admin'],
  }),
);

// ---------------- Subject teacher allocation ----------------
router.use(
  '/subject-assignments',
  crudRouter({
    table: subjectAssignments,
    entity: 'subject_assignment',
    createSchema: z.object({
      sectionId: z.string().uuid(),
      classSubjectId: z.string().uuid(),
      employeeId: z.string().uuid(),
    }),
    orderBy: 'createdAt',
    roles: [...READ],
    createRoles: [...WRITE],
    updateRoles: [...WRITE],
    deleteRoles: ['super_admin', 'school_admin'],
  }),
);

// ---------------- School events / holidays ----------------
router.use(
  '/events',
  crudRouter({
    table: schoolEvents,
    entity: 'school_event',
    createSchema: z.object({
      titleEn: z.string().min(1).max(200),
      titleNe: z.string().max(200).optional().nullable(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type: z.enum(['holiday', 'event', 'exam', 'vacation', 'meeting']).default('event'),
      description: z.string().max(2000).optional().nullable(),
      isRecurring: z.boolean().default(false),
    }),
    searchFields: ['titleEn', 'titleNe'],
    orderBy: 'startDate',
    order: 'asc',
    roles: [...READ],
    createRoles: [...WRITE],
    updateRoles: [...WRITE],
    deleteRoles: [...WRITE],
  }),
);

// ---------------- Academic structure (classes → sections → subjects) ----------------
router.get('/structure', async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [classRows, sectionRows, subjectRows] = await Promise.all([
      db.select().from(classes).where(eq(classes.schoolId, schoolId)).orderBy(asc(classes.orderIndex)),
      db.select().from(sections).where(eq(sections.schoolId, schoolId)).orderBy(asc(sections.name)),
      db.select().from(subjects).where(eq(subjects.schoolId, schoolId)).orderBy(asc(subjects.nameEn)),
    ]);
    const withSections = classRows.map((c) => ({
      ...c,
      sections: sectionRows.filter((s) => s.classId === c.id),
      subjectCount: 0,
    }));
    res.json({ ok: true, data: { classes: withSections, subjects: subjectRows, sectionCount: sectionRows.length } });
  } catch (err) { next(err); }
});

// Subject list for a class (with mark config + assigned teachers)
router.get('/class/:classId/subjects', async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const rows = await db
      .select({
        id: classSubjects.id, classId: classSubjects.classId, subjectId: classSubjects.subjectId,
        isCompulsory: classSubjects.isCompulsory, theoryFull: classSubjects.theoryFull, theoryPass: classSubjects.theoryPass,
        practicalFull: classSubjects.practicalFull, practicalPass: classSubjects.practicalPass,
        internalFull: classSubjects.internalFull, internalPass: classSubjects.internalPass,
        creditHours: classSubjects.creditHours,
        theoryCreditHours: classSubjects.theoryCreditHours, internalCreditHours: classSubjects.internalCreditHours,
        orderIndex: classSubjects.orderIndex,
        nameEn: subjects.nameEn, nameNe: subjects.nameNe, code: subjects.code, subjectType: subjects.type, hasPractical: subjects.hasPractical,
      })
      .from(classSubjects)
      .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
      .where(and(eq(classSubjects.schoolId, schoolId), eq(classSubjects.classId, req.params.classId)))
      .orderBy(asc(classSubjects.orderIndex));
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

// ---------------- Class routine ----------------
router.get('/routine', async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(routines.schoolId, schoolId)];
    if (req.query.sectionId) filters.push(eq(routines.sectionId, String(req.query.sectionId)));
    if (req.query.employeeId) filters.push(eq(routines.employeeId, String(req.query.employeeId)));
    if (req.query.day) filters.push(eq(routines.day, Number(req.query.day)));
    const rows = await db.select().from(routines).where(and(...filters)).orderBy(asc(routines.day), asc(routines.periodNo));
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

const routineSlotSchema = z.object({
  sectionId: z.string().uuid(),
  day: z.number().int().min(0).max(6),
  periodNo: z.number().int().min(1).max(30),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.enum(['class', 'break', 'lunch', 'assembly']).default('class'),
  subjectId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  room: z.string().max(60).optional().nullable(),
});

/** Save one routine slot with teacher-conflict detection. */
router.put(
  '/routine',
  requireRole(...WRITE, 'teacher'),
  validateBody(routineSlotSchema),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const schoolId = req.auth!.schoolId!;
      const body = req.body;

      // Conflict 1: same section already has this period
      const [slotClash] = await db
        .select({ id: routines.id })
        .from(routines)
        .where(and(
          eq(routines.schoolId, schoolId),
          eq(routines.sectionId, body.sectionId),
          eq(routines.day, body.day),
          eq(routines.periodNo, body.periodNo),
        ))
        .limit(1);

      // Conflict 2: teacher double-booked in another section at same day/period
      if (body.employeeId) {
        const [teacherClash] = await db
          .select({ id: routines.id, sectionId: routines.sectionId })
          .from(routines)
          .where(and(
            eq(routines.schoolId, schoolId),
            eq(routines.day, body.day),
            eq(routines.periodNo, body.periodNo),
            eq(routines.employeeId, body.employeeId),
          ))
          .limit(1);
        if (teacherClash && teacherClash.sectionId !== body.sectionId) {
          throw ApiError.badRequest('This teacher is already assigned to another class at this day and period');
        }
      }

      const values: any = { ...body, schoolId, updatedAt: new Date() };
      let row;
      if (slotClash) {
        [row] = await db.update(routines).set(values).where(eq(routines.id, slotClash.id)).returning();
      } else {
        [row] = await db.insert(routines).values(values).returning();
      }
      res.json({ ok: true, data: row });
    } catch (err) { next(err); }
  },
);

router.delete('/routine/:id', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(routines)
      .where(and(eq(routines.id, req.params.id), eq(routines.schoolId, req.auth!.schoolId!)))
      .returning();
    if (!row) throw ApiError.notFound('Routine slot not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

/** Clear a section's routine (before regenerating). */
router.delete('/routine/section/:sectionId', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    const deleted = await db.delete(routines)
      .where(and(eq(routines.sectionId, req.params.sectionId), eq(routines.schoolId, req.auth!.schoolId!)))
      .returning({ id: routines.id });
    await audit(db, {
      schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'clear_routine',
      entity: 'routine', entityId: req.params.sectionId, ip: req.ip,
    });
    res.json({ ok: true, data: { cleared: deleted.length } });
  } catch (err) { next(err); }
});

/**
 * Automatic routine generator: allocates subjects to periods avoiding teacher conflicts.
 * Teachers' availability is inferred from their other section routines.
 */
router.post(
  '/routine/generate',
  requireRole(...WRITE),
  validateBody(z.object({
    sectionId: z.string().uuid(),
    periodsPerDay: z.number().int().min(1).max(12).default(8),
    days: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5]), // Sun-Fri (Sat optional)
    startTime: z.string().regex(/^\d{2}:\d{2}$/).default('06:00'),
    periodMinutes: z.number().int().min(10).max(120).default(45),
    breakAfter: z.number().int().min(0).max(12).default(3),
    breakMinutes: z.number().int().min(5).max(60).default(20),
    teacherId: z.string().uuid().optional().nullable(), // preferred class teacher
  })),
  async (req, res, next) => {
    try {
      const db = await getDb();
      const schoolId = req.auth!.schoolId!;
      const p = req.body;
      const [section] = await db.select().from(sections).where(and(eq(sections.id, p.sectionId), eq(sections.schoolId, schoolId))).limit(1);
      if (!section) throw ApiError.notFound('Section not found');

      const classSubs = await db.select().from(classSubjects).where(and(eq(classSubjects.schoolId, schoolId), eq(classSubjects.classId, section.classId)));
      if (!classSubs.length) throw ApiError.badRequest('No subjects configured for this class. Add subjects first.');

      const subjectIds = classSubs.map((cs) => cs.subjectId);
      const assignments = await db.select().from(subjectAssignments)
        .where(and(eq(subjectAssignments.schoolId, schoolId), eq(subjectAssignments.sectionId, p.sectionId)));
      const assignedTeacherBySubject = new Map(assignments.map((a) => [a.classSubjectId, a.employeeId]));
      const csById = new Map(classSubs.map((cs) => [cs.id, cs]));

      // Teacher busy map: day -> period -> Set(teacherId)
      const busy = new Map<string, Set<string>>();
      const existingRoutines = await db.select().from(routines).where(eq(routines.schoolId, schoolId));
      for (const r of existingRoutines) {
        if (!r.employeeId) continue;
        const key = `${r.day}:${r.periodNo}`;
        if (!busy.has(key)) busy.set(key, new Set());
        busy.get(key)!.add(r.employeeId);
      }

      await db.delete(routines).where(and(eq(routines.sectionId, p.sectionId), eq(routines.schoolId, schoolId)));

      const rows: any[] = [];
      const counts = new Map<string, number>();
      for (const sid of subjectIds) counts.set(sid, 0);
      const targetPerSubject = Math.max(1, Math.floor((p.periodsPerDay * p.days.length) / subjectIds.length));

      const addTime = (start: string, minutes: number) => {
        const [h, m] = start.split(':').map(Number);
        const total = h * 60 + m + minutes;
        return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
      };

      let generated = 0;
      let conflicts = 0;

      for (const day of p.days) {
        let cursor = p.startTime;
        for (let period = 1; period <= p.periodsPerDay; period++) {
          const isBreak = p.breakAfter > 0 && period === p.breakAfter;
          const endTime = addTime(cursor, isBreak ? p.breakMinutes : p.periodMinutes);
          if (isBreak) {
            rows.push({
              schoolId, sectionId: p.sectionId, day, periodNo: period,
              startTime: cursor, endTime, type: 'break', subjectId: null, employeeId: null,
            });
            cursor = endTime;
            continue;
          }

          // pick the subject with fewest allocations so far, round-robin
          const sorted = [...subjectIds].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
          let chosen: string | null = null;
          let chosenTeacher: string | null = null;
          for (const sid of sorted) {
            const cs = csById.get(sid)!;
            const teacher = assignedTeacherBySubject.get(cs.id) ?? null;
            if (teacher && busy.get(`${day}:${period}`)?.has(teacher)) { conflicts++; continue; }
            chosen = sid;
            chosenTeacher = teacher;
            break;
          }
          if (!chosen) {
            // all teachers busy: leave period free for manual adjustment
            rows.push({
              schoolId, sectionId: p.sectionId, day, periodNo: period,
              startTime: cursor, endTime, type: 'class', subjectId: null, employeeId: null,
            });
            cursor = endTime;
            continue;
          }
          counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
          if (chosenTeacher) {
            const key = `${day}:${period}`;
            if (!busy.has(key)) busy.set(key, new Set());
            busy.get(key)!.add(chosenTeacher);
          }
          rows.push({
            schoolId, sectionId: p.sectionId, day, periodNo: period,
            startTime: cursor, endTime, type: 'class', subjectId: chosen, employeeId: chosenTeacher,
          });
          generated++;
          cursor = endTime;
        }
      }

      if (rows.length) await db.insert(routines).values(rows);
      await audit(db, {
        schoolId, userId: req.auth!.id, action: 'generate_routine', entity: 'routine',
        entityId: p.sectionId, detail: { slots: rows.length, conflicts }, ip: req.ip,
      });
      res.json({ ok: true, data: { slots: rows.length, subjectsAllocated: generated, skippedTeacherConflicts: conflicts } });
    } catch (err) { next(err); }
  },
);

export default router;
