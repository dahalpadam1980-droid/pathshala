import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import multer from 'multer';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import {
  exams, examSubjects, marks, subjects as subjectTable, classes as classTable, sections,
  students, gradingScales, gradeBands, academicYears, examRoutine, studentAttendance,
  classSubjects, studentSubjects,
} from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { gradeSubject, computeGpa, overallResult, type GradeBand } from '../../lib/grading.js';
import { parseSpreadsheet, toCsv, toXlsx, type ExportColumn } from '../../lib/excel.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const READ = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'] as const;
const WRITE = ['super_admin', 'school_admin', 'office'] as const;
const TEACH = ['super_admin', 'school_admin', 'office', 'teacher'] as const;

const EXAM_TYPES = ['terminal_1', 'terminal_2', 'terminal_3', 'final', 'unit', 'monthly', 'practical', 'internal', 'ble', 'see_prep', 'neb', 'custom'] as const;

// ================= Grading scales (configuration, never hardcoded) =================

router.get('/grading-scales', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(gradingScales)
      .where(eq(gradingScales.schoolId, req.auth!.schoolId!))
      .orderBy(desc(gradingScales.isDefault), asc(gradingScales.name));
    const bandRows = rows.length
      ? await db.select().from(gradeBands).where(inArray(gradeBands.scaleId, rows.map((r) => r.id))).orderBy(asc(gradeBands.minPercent))
      : [];
    res.json({
      ok: true,
      data: rows.map((s) => ({ ...s, bands: bandRows.filter((b) => b.scaleId === s.id).map((b) => ({ ...b, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent), gradePoint: Number(b.gradePoint) })) })),
    });
  } catch (err) { next(err); }
});

router.post('/grading-scales', requireRole(...WRITE), validateBody(z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(60),
  description: z.string().max(1000).optional().nullable(),
  classId: z.string().uuid().optional().nullable(),
  examType: z.string().max(40).optional().nullable(),
  gpaFormula: z.enum(['weighted', 'average']).default('weighted'),
  isDefault: z.boolean().default(false),
  bands: z.array(z.object({
    minPercent: z.number().min(0).max(100),
    maxPercent: z.number().min(0).max(100),
    letter: z.string().min(1).max(10),
    gradePoint: z.number().min(0).max(4),
    remark: z.string().max(120).optional().nullable(),
    isNg: z.boolean().default(false),
  })).min(1).max(40),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const { bands, ...scaleBody } = req.body;
    for (const b of bands) {
      if (b.maxPercent < b.minPercent) throw ApiError.badRequest(`Band "${b.letter}": max percent cannot be less than min percent`);
    }
    if (scaleBody.isDefault) await db.update(gradingScales).set({ isDefault: false }).where(eq(gradingScales.schoolId, schoolId));
    const [scale] = await db.insert(gradingScales).values({ ...scaleBody, schoolId }).returning();
    await db.insert(gradeBands).values((bands as any[]).map((b: any, i: number) => ({
      scaleId: scale.id, minPercent: String(b.minPercent), maxPercent: String(b.maxPercent),
      letter: b.letter, gradePoint: String(b.gradePoint), remark: b.remark ?? null,
      isNg: b.isNg, sortOrder: i,
    })));
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'grading_scale', entityId: scale.id, detail: { name: scale.name, bands: bands.length }, ip: req.ip });
    res.status(201).json({ ok: true, data: scale });
  } catch (err) { next(err); }
});

router.patch('/grading-scales/:id', requireRole(...WRITE), validateBody(z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  active: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  gpaFormula: z.enum(['weighted', 'average']).optional(),
  bands: z.array(z.object({
    minPercent: z.number().min(0).max(100),
    maxPercent: z.number().min(0).max(100),
    letter: z.string().min(1).max(10),
    gradePoint: z.number().min(0).max(4),
    remark: z.string().max(120).optional().nullable(),
    isNg: z.boolean().default(false),
  })).optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [existing] = await db.select().from(gradingScales)
      .where(and(eq(gradingScales.id, req.params.id), eq(gradingScales.schoolId, schoolId))).limit(1);
    if (!existing) throw ApiError.notFound('Grading scale not found');
    const { bands, ...updates } = req.body;
    if (updates.isDefault) await db.update(gradingScales).set({ isDefault: false }).where(eq(gradingScales.schoolId, schoolId));
    if (Object.keys(updates).length) await db.update(gradingScales).set(updates).where(eq(gradingScales.id, existing.id));
    if (bands) {
      await db.delete(gradeBands).where(eq(gradeBands.scaleId, existing.id));
      await db.insert(gradeBands).values((bands as any[]).map((b: any, i: number) => ({
        scaleId: existing.id, minPercent: String(b.minPercent), maxPercent: String(b.maxPercent),
        letter: b.letter, gradePoint: String(b.gradePoint), remark: b.remark ?? null, isNg: b.isNg, sortOrder: i,
      })));
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'update', entity: 'grading_scale', entityId: existing.id, detail: { bands: bands?.length }, ip: req.ip });
    res.json({ ok: true, data: { id: existing.id, updated: true } });
  } catch (err) { next(err); }
});

router.delete('/grading-scales/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [existing] = await db.select().from(gradingScales)
      .where(and(eq(gradingScales.id, req.params.id), eq(gradingScales.schoolId, req.auth!.schoolId!))).limit(1);
    if (!existing) throw ApiError.notFound('Grading scale not found');
    if (existing.isDefault) throw ApiError.badRequest('The default grading scale cannot be deleted');
    await db.delete(gradeBands).where(eq(gradeBands.scaleId, existing.id));
    await db.delete(gradingScales).where(eq(gradingScales.id, existing.id));
    res.json({ ok: true, data: { id: existing.id, deleted: true } });
  } catch (err) { next(err); }
});

/** Resolve the effective grading bands for a class + exam type. */
async function resolveBands(schoolId: string, opts: { classId?: string | null; examType?: string | null; scaleId?: string | null }): Promise<GradeBand[]> {
  const db = await getDb();
  let scale = null as any;
  if (opts.scaleId) {
    [scale] = await db.select().from(gradingScales).where(eq(gradingScales.id, opts.scaleId)).limit(1);
  }
  if (!scale && opts.classId) {
    [scale] = await db.select().from(gradingScales)
      .where(and(eq(gradingScales.schoolId, schoolId), eq(gradingScales.classId, opts.classId), eq(gradingScales.active, true))).limit(1);
  }
  if (!scale && opts.examType) {
    [scale] = await db.select().from(gradingScales)
      .where(and(eq(gradingScales.schoolId, schoolId), eq(gradingScales.examType, opts.examType), eq(gradingScales.active, true))).limit(1);
  }
  if (!scale) {
    [scale] = await db.select().from(gradingScales)
      .where(and(eq(gradingScales.schoolId, schoolId), eq(gradingScales.isDefault, true), eq(gradingScales.active, true))).limit(1);
  }
  if (!scale) return [];
  const bands = await db.select().from(gradeBands).where(eq(gradeBands.scaleId, scale.id)).orderBy(asc(gradeBands.minPercent));
  return bands.map((b) => ({
    id: b.id, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent),
    letter: b.letter, gradePoint: Number(b.gradePoint), isNg: b.isNg, remark: b.remark ?? undefined,
  }));
}

// ================= Exams =================

const examSchema = z.object({
  academicYearId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(150),
  nameNe: z.string().max(150).optional().nullable(),
  type: z.enum(EXAM_TYPES).default('terminal_1'),
  classId: z.string().uuid().optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  gradingScaleId: z.string().uuid().optional().nullable(),
  remarks: z.string().max(2000).optional().nullable(),
});

router.get('/', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(exams.schoolId, schoolId)];
    if (req.query.academicYearId) filters.push(eq(exams.academicYearId, String(req.query.academicYearId)));
    if (req.query.status) filters.push(eq(exams.status, String(req.query.status)));
    if (req.query.type) filters.push(eq(exams.type, String(req.query.type)));
    const rows = await db
      .select({
        id: exams.id, name: exams.name, nameNe: exams.nameNe, type: exams.type, status: exams.status,
        startDate: exams.startDate, endDate: exams.endDate, classId: exams.classId,
        publishedAt: exams.publishedAt, lockedAt: exams.lockedAt, createdAt: exams.createdAt,
        className: classTable.name, yearName: academicYears.name,
        subjectCount: sql<number>`(select count(*)::int from ${examSubjects} where ${examSubjects.examId} = ${exams.id})`,
        markedCount: sql<number>`(select count(*)::int from ${marks} inner join ${examSubjects} on ${examSubjects.id} = ${marks.examSubjectId} where ${examSubjects.examId} = ${exams.id})`,
      })
      .from(exams)
      .leftJoin(classTable, eq(classTable.id, exams.classId))
      .leftJoin(academicYears, eq(academicYears.id, exams.academicYearId))
      .where(and(...filters))
      .orderBy(desc(exams.createdAt)).limit(200);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', requireRole(...WRITE), validateBody(examSchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    let yearId = req.body.academicYearId;
    if (!yearId) {
      const [year] = await db.select({ id: academicYears.id }).from(academicYears)
        .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true))).limit(1);
      yearId = year?.id ?? null;
    }
    const [row] = await db.insert(exams).values({
      ...req.body, schoolId, academicYearId: yearId, createdBy: req.auth!.id,
    }).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'exam', entityId: row.id, detail: { name: row.name, type: row.type }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.get('/:id', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const [exam] = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, req.auth!.schoolId!))).limit(1);
    if (!exam) throw ApiError.notFound('Exam not found');

    const subjectRows = await db
      .select({
        es: examSubjects,
        subjectNameEn: subjectTable.nameEn, subjectNameNe: subjectTable.nameNe, subjectCode: subjectTable.code,
        className: classTable.name,
        marked: sql<number>`(select count(*)::int from ${marks} where ${marks.examSubjectId} = ${examSubjects.id})`,
        studentsTotal: sql<number>`(select count(*)::int from ${students} where ${students.schoolId} = ${examSubjects.schoolId} and ${students.classId} = ${examSubjects.classId} and ${students.status} = 'active')`,
      })
      .from(examSubjects)
      .leftJoin(subjectTable, eq(subjectTable.id, examSubjects.subjectId))
      .leftJoin(classTable, eq(classTable.id, examSubjects.classId))
      .where(eq(examSubjects.examId, exam.id))
      .orderBy(asc(classTable.orderIndex), asc(subjectTable.nameEn));

    res.json({ ok: true, data: { ...exam, subjects: subjectRows } });
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(...WRITE), validateBody(examSchema.partial()), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(exams).set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Exam not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [exam] = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, req.auth!.schoolId!))).limit(1);
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.status === 'locked') throw ApiError.badRequest('A locked exam cannot be deleted');
    const subs = await db.select({ id: examSubjects.id }).from(examSubjects).where(eq(examSubjects.examId, exam.id));
    if (subs.length) await db.delete(marks).where(inArray(marks.examSubjectId, subs.map((s) => s.id)));
    await db.delete(examSubjects).where(eq(examSubjects.examId, exam.id));
    await db.delete(examRoutine).where(eq(examRoutine.examId, exam.id));
    await db.delete(exams).where(eq(exams.id, exam.id));
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'delete', entity: 'exam', entityId: exam.id, detail: { name: exam.name }, ip: req.ip });
    res.json({ ok: true, data: { id: exam.id, deleted: true } });
  } catch (err) { next(err); }
});

/** Auto-configure exam subjects from the class subject list. */
router.post('/:id/subjects/generate', requireRole(...WRITE), validateBody(z.object({
  classId: z.string().uuid(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [exam] = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, schoolId))).limit(1);
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.status === 'locked') throw ApiError.badRequest('Exam is locked');

    const classSubs = await db.select().from(classTable).where(eq(classTable.id, req.body.classId)).limit(1);
    if (!classSubs.length) throw ApiError.notFound('Class not found');
    const { classSubjects } = await import('../../db/schema/index.js');
    const csRows = await db.select().from(classSubjects)
      .where(and(eq(classSubjects.schoolId, schoolId), eq(classSubjects.classId, req.body.classId)));
    if (!csRows.length) throw ApiError.badRequest('No subjects mapped to this class yet');

    const existing = await db.select().from(examSubjects).where(eq(examSubjects.examId, exam.id));
    const existingKeys = new Set(existing.map((e) => `${e.classId}:${e.subjectId}`));
    let created = 0;
    for (const cs of csRows) {
      if (existingKeys.has(`${req.body.classId}:${cs.subjectId}`)) continue;
      await db.insert(examSubjects).values({
        schoolId, examId: exam.id, classId: cs.classId, subjectId: cs.subjectId,
        theoryFull: cs.theoryFull, theoryPass: cs.theoryPass,
        practicalFull: cs.practicalFull, practicalPass: cs.practicalPass,
        internalFull: cs.internalFull, internalPass: cs.internalPass, creditHours: cs.creditHours,
      });
      created++;
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'generate_exam_subjects', entity: 'exam', entityId: exam.id, detail: { classId: req.body.classId, created }, ip: req.ip });
    res.json({ ok: true, data: { created } });
  } catch (err) { next(err); }
});

const examSubjectSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  theoryFull: z.number().int().min(0).max(200).default(75),
  theoryPass: z.number().int().min(0).max(200).default(24),
  // Defaults follow the THEORY + INTERNAL split (practical is legacy-only).
  practicalFull: z.number().int().min(0).max(200).default(0),
  practicalPass: z.number().int().min(0).max(200).default(0),
  internalFull: z.number().int().min(0).max(200).default(25),
  internalPass: z.number().int().min(0).max(200).default(9),
  creditHours: z.coerce.string().regex(/^\d+(\.\d+)?$/).default('0'),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  room: z.string().max(60).optional().nullable(),
  invigilatorId: z.string().uuid().optional().nullable(),
});

router.post('/:id/subjects', requireRole(...WRITE), validateBody(examSubjectSchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [exam] = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, schoolId))).limit(1);
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.status === 'locked') throw ApiError.badRequest('Exam is locked');
    const [dupe] = await db.select({ id: examSubjects.id }).from(examSubjects)
      .where(and(eq(examSubjects.examId, exam.id), eq(examSubjects.classId, req.body.classId), eq(examSubjects.subjectId, req.body.subjectId))).limit(1);
    if (dupe) throw ApiError.conflict('Subject already configured for this class in this exam');
    // Prefer the class's own mark configuration when present.
    const [cs] = await db.select().from(classSubjects)
      .where(and(eq(classSubjects.schoolId, schoolId), eq(classSubjects.classId, req.body.classId), eq(classSubjects.subjectId, req.body.subjectId))).limit(1);
    const values = cs
      ? {
          ...req.body,
          theoryFull: cs.theoryFull, theoryPass: cs.theoryPass,
          practicalFull: cs.practicalFull, practicalPass: cs.practicalPass,
          internalFull: cs.internalFull, internalPass: cs.internalPass, creditHours: cs.creditHours,
        }
      : req.body;
    const [row] = await db.insert(examSubjects).values({ ...values, schoolId, examId: exam.id }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/subjects/:subjectExamId', requireRole(...WRITE), validateBody(examSubjectSchema.partial()), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(examSubjects).set(req.body)
      .where(and(eq(examSubjects.id, req.params.subjectExamId), eq(examSubjects.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Exam subject not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/subjects/:subjectExamId', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.select().from(examSubjects)
      .where(and(eq(examSubjects.id, req.params.subjectExamId), eq(examSubjects.schoolId, req.auth!.schoolId!))).limit(1);
    if (!row) throw ApiError.notFound('Exam subject not found');
    await db.delete(marks).where(eq(marks.examSubjectId, row.id));
    await db.delete(examSubjects).where(eq(examSubjects.id, row.id));
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Marks entry =================

/** Roster with current marks for one exam subject (marks entry screen). */
router.get('/subjects/:subjectExamId/marks', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [es] = await db.select().from(examSubjects)
      .where(and(eq(examSubjects.id, req.params.subjectExamId), eq(examSubjects.schoolId, schoolId))).limit(1);
    if (!es) throw ApiError.notFound('Exam subject not found');

    const roster = await db
      .select({
        id: students.id, admissionNo: students.admissionNo, nameEn: students.nameEn, nameNe: students.nameNe,
        rollNo: students.rollNo, photoUrl: students.photoUrl,
      })
      .from(students)
      .where(and(eq(students.schoolId, schoolId), eq(students.classId, es.classId), eq(students.status, 'active')))
      .orderBy(asc(students.rollNo), asc(students.nameEn));

    // Optional-subject filtering: compulsory → every student; optional → students who
    // chose it (students with no recorded choices are still included everywhere).
    const [csCfg] = await db.select({ isCompulsory: classSubjects.isCompulsory }).from(classSubjects)
      .where(and(eq(classSubjects.classId, es.classId), eq(classSubjects.subjectId, es.subjectId))).limit(1);
    let visibleRoster = roster;
    if (csCfg && !csCfg.isCompulsory && roster.length) {
      const choiceRows = await db
        .select({ studentId: studentSubjects.studentId, subjectId: studentSubjects.subjectId })
        .from(studentSubjects)
        .where(and(
          eq(studentSubjects.schoolId, schoolId),
          inArray(studentSubjects.studentId, roster.map((s) => s.id)),
        ));
      const chosenByStudent = new Map<string, Set<string>>();
      for (const c of choiceRows) {
        if (!chosenByStudent.has(c.studentId)) chosenByStudent.set(c.studentId, new Set());
        chosenByStudent.get(c.studentId)!.add(c.subjectId);
      }
      if (chosenByStudent.size) {
        visibleRoster = roster.filter((s) => {
          const mine = chosenByStudent.get(s.id);
          return !mine || mine.has(es.subjectId);
        });
      }
    }

    const markRows = await db.select().from(marks).where(eq(marks.examSubjectId, es.id));
    const byStudent = new Map(markRows.map((m) => [m.studentId, m]));

    const data = visibleRoster.map((s) => {
      const m = byStudent.get(s.id);
      return {
        ...s,
        theoryObtained: m?.theoryObtained != null ? Number(m.theoryObtained) : null,
        practicalObtained: m?.practicalObtained != null ? Number(m.practicalObtained) : null,
        internalObtained: m?.internalObtained != null ? Number(m.internalObtained) : null,
        total: m?.total != null ? Number(m.total) : null,
        percent: m?.percent != null ? Number(m.percent) : null,
        gradeLetter: m?.gradeLetter ?? null,
        gradePoint: m?.gradePoint != null ? Number(m.gradePoint) : null,
        isAbsent: m?.isAbsent ?? false,
        isPassed: m?.isPassed ?? false,
        remark: m?.remark ?? null,
      };
    });
    res.json({ ok: true, data, meta: { config: es, entered: markRows.length, total: visibleRoster.length } });
  } catch (err) { next(err); }
});

async function assertMarksEntryOpen(examId: string, schoolId: string) {
  const db = await getDb();
  const [exam] = await db.select({ status: exams.status }).from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) throw ApiError.notFound('Exam not found');
  if (exam.status === 'locked') throw ApiError.badRequest('Results are locked. Reopen the exam to edit marks.');
  if (exam.status === 'published') throw ApiError.badRequest('Results are published. Reopen the exam before editing marks.');
  return exam;
}

const marksEntrySchema = z.object({
  examSubjectId: z.string().uuid(),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    theoryObtained: z.number().min(0).max(200).nullable().optional(),
    practicalObtained: z.number().min(0).max(200).nullable().optional(),
    internalObtained: z.number().min(0).max(200).nullable().optional(),
    isAbsent: z.boolean().default(false),
  })).min(1).max(600),
});

/** Bulk marks entry with automatic grading. */
router.post('/marks', requireRole(...TEACH), validateBody(marksEntrySchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const { examSubjectId, records } = req.body;

    const [es] = await db.select().from(examSubjects)
      .where(and(eq(examSubjects.id, examSubjectId), eq(examSubjects.schoolId, schoolId))).limit(1);
    if (!es) throw ApiError.notFound('Exam subject not found');
    const [exam] = await db.select().from(exams).where(eq(exams.id, es.examId)).limit(1);
    await assertMarksEntryOpen(es.examId, schoolId);

    const bands = await resolveBands(schoolId, { classId: es.classId, examType: exam?.type ?? null, scaleId: exam?.gradingScaleId ?? null });

    let saved = 0;
    for (const r of records) {
      const result = gradeSubject(bands, {
        theoryObtained: r.theoryObtained, practicalObtained: r.practicalObtained, internalObtained: r.internalObtained,
        theoryFull: es.theoryFull, practicalFull: es.practicalFull, internalFull: es.internalFull,
        theoryPass: es.theoryPass, practicalPass: es.practicalPass, internalPass: es.internalPass,
        isAbsent: r.isAbsent,
      });
      const values = {
        schoolId, examSubjectId, studentId: r.studentId,
        theoryObtained: r.isAbsent ? null : String(r.theoryObtained ?? 0),
        practicalObtained: r.isAbsent ? null : String(r.practicalObtained ?? 0),
        internalObtained: r.isAbsent ? null : String(r.internalObtained ?? 0),
        total: String(result.total), maxTotal: String(result.maxTotal), percent: String(result.percent),
        isAbsent: r.isAbsent, isPassed: result.isPassed,
        gradeLetter: result.gradeLetter, gradePoint: String(result.gradePoint ?? 0),
        remark: result.remark, enteredBy: req.auth!.id, updatedAt: new Date(),
      };
      const [existing] = await db.select({ id: marks.id }).from(marks)
        .where(and(eq(marks.examSubjectId, examSubjectId), eq(marks.studentId, r.studentId))).limit(1);
      if (existing) await db.update(marks).set(values).where(eq(marks.id, existing.id));
      else await db.insert(marks).values(values);
      saved++;
    }

    if (exam && exam.status === 'draft') {
      await db.update(exams).set({ status: 'marks_entry', updatedAt: new Date() }).where(eq(exams.id, exam.id));
    }
    res.json({ ok: true, data: { saved, gradingScale: bands.length ? 'applied' : 'none_found' } });
  } catch (err) { next(err); }
});

/** Import marks from spreadsheet: columns = Admission No / Roll No / Name + Theory + Practical + Internal. */
const marksUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, process.cwd()),
    filename: (_req, file, cb) => cb(null, `marks-${Date.now()}${path.extname(file.originalname) || '.xlsx'}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/marks/import', requireRole(...TEACH), marksUpload.single('file'), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const examSubjectId = String(req.body.examSubjectId ?? '');
    if (!examSubjectId) throw ApiError.badRequest('examSubjectId is required');
    if (!req.file) throw ApiError.badRequest('Upload a spreadsheet file as "file"');

    const [es] = await db.select().from(examSubjects)
      .where(and(eq(examSubjects.id, examSubjectId), eq(examSubjects.schoolId, schoolId))).limit(1);
    if (!es) throw ApiError.notFound('Exam subject not found');
    const [exam] = await db.select().from(exams).where(eq(exams.id, es.examId)).limit(1);
    await assertMarksEntryOpen(es.examId, schoolId);
    const bands = await resolveBands(schoolId, { classId: es.classId, examType: exam?.type ?? null, scaleId: exam?.gradingScaleId ?? null });

    const rows = await parseSpreadsheet(req.file.path);
    const roster = await db.select().from(students)
      .where(and(eq(students.schoolId, schoolId), eq(students.classId, es.classId)));
    const byAdmission = new Map(roster.map((s) => [s.admissionNo.toLowerCase(), s]));
    const byRoll = new Map(roster.filter((s) => s.rollNo != null).map((s) => [String(s.rollNo), s]));

    let saved = 0;
    const errors: { row: number; message: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = i + 2;
      try {
        const admission = String(r['Admission No'] ?? r['admissionNo'] ?? '').trim().toLowerCase();
        const roll = String(r['Roll No'] ?? r['rollNo'] ?? '').trim();
        const student = byAdmission.get(admission) ?? byRoll.get(roll);
        if (!student) { errors.push({ row: rowNo, message: 'Student not found' }); continue; }
        const isAbsentRaw = String(r['Absent'] ?? r['isAbsent'] ?? '').toLowerCase();
        const isAbsent = ['y', 'yes', 'true', '1', 'absent'].includes(isAbsentRaw);
        const theory = r['Theory'] ?? r['theory'] ?? r['Theory Obtained'] ?? '';
        const practical = r['Practical'] ?? r['practical'] ?? '';
        const internal = r['Internal'] ?? r['internal'] ?? '';
        const result = gradeSubject(bands, {
          theoryObtained: Number(theory) || 0, practicalObtained: Number(practical) || 0, internalObtained: Number(internal) || 0,
          theoryFull: es.theoryFull, practicalFull: es.practicalFull, internalFull: es.internalFull,
          theoryPass: es.theoryPass, practicalPass: es.practicalPass, internalPass: es.internalPass, isAbsent,
        });
        const values = {
          schoolId, examSubjectId, studentId: student.id,
          theoryObtained: isAbsent ? null : String(Number(theory) || 0),
          practicalObtained: isAbsent ? null : String(Number(practical) || 0),
          internalObtained: isAbsent ? null : String(Number(internal) || 0),
          total: String(result.total), maxTotal: String(result.maxTotal), percent: String(result.percent),
          isAbsent, isPassed: result.isPassed, gradeLetter: result.gradeLetter,
          gradePoint: String(result.gradePoint ?? 0), remark: result.remark,
          enteredBy: req.auth!.id, updatedAt: new Date(),
        };
        const [existing] = await db.select({ id: marks.id }).from(marks)
          .where(and(eq(marks.examSubjectId, examSubjectId), eq(marks.studentId, student.id))).limit(1);
        if (existing) await db.update(marks).set(values).where(eq(marks.id, existing.id));
        else await db.insert(marks).values(values);
        saved++;
      } catch (err) { errors.push({ row: rowNo, message: (err as Error).message.slice(0, 150) }); }
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'import_marks', entity: 'marks', entityId: examSubjectId, detail: { saved, errors: errors.length }, ip: req.ip });
    res.json({ ok: true, data: { saved, failed: errors.length, errors: errors.slice(0, 40) } });
  } catch (err) { next(err); }
});

// ================= Results =================

interface ResultRow {
  studentId: string;
  admissionNo: string;
  nameEn: string;
  nameNe: string | null;
  rollNo: number | null;
  subjects: {
    subjectId: string; subjectNameEn: string; subjectNameNe: string | null;
    theory: number; practical: number; internal: number; total: number; maxTotal: number;
    percent: number; gradeLetter: string | null; gradePoint: number; isPassed: boolean; isAbsent: boolean;
    creditHours: string; remark: string | null;
  }[];
  totalMarks: number;
  maxMarks: number;
  percent: number;
  gpa: number;
  failedSubjects: number;
  totalSubjects: number;
  passed: boolean;
  rank?: number;
}

async function buildResults(schoolId: string, examId: string, classId?: string | null): Promise<{ exam: any; scale: any; results: ResultRow[] }> {
  const db = await getDb();
  const [exam] = await db.select().from(exams)
    .where(and(eq(exams.id, examId), eq(exams.schoolId, schoolId))).limit(1);
  if (!exam) throw ApiError.notFound('Exam not found');

  const esFilters: any[] = [eq(examSubjects.examId, examId)];
  if (classId) esFilters.push(eq(examSubjects.classId, classId));
  const esRows = await db.select().from(examSubjects).where(and(...esFilters));
  const esIds = esRows.map((e) => e.id);
  if (!esIds.length) return { exam, scale: null, results: [] };

  const markRows = esIds.length
    ? await db.select().from(marks).where(inArray(marks.examSubjectId, esIds))
    : [];
  const subjectRows = await db.select().from(subjectTable)
    .where(inArray(subjectTable.id, esRows.map((e) => e.subjectId)));
  const subjectById = new Map(subjectRows.map((s) => [s.id, s]));
  const esById = new Map(esRows.map((e) => [e.id, e]));

  const studentIds = [...new Set(markRows.map((m) => m.studentId))];
  const studentRows = studentIds.length
    ? await db.select({
        id: students.id, admissionNo: students.admissionNo, nameEn: students.nameEn,
        nameNe: students.nameNe, rollNo: students.rollNo,
      }).from(students).where(inArray(students.id, studentIds))
    : [];
  const studentById = new Map(studentRows.map((s) => [s.id, s]));

  // Also include students of the class who have no marks (absent for all)
  if (classId) {
    const classStudents = await db.select({
      id: students.id, admissionNo: students.admissionNo, nameEn: students.nameEn,
      nameNe: students.nameNe, rollNo: students.rollNo,
    }).from(students).where(and(eq(students.schoolId, schoolId), eq(students.classId, classId), eq(students.status, 'active')));
    for (const s of classStudents) if (!studentById.has(s.id)) studentById.set(s.id, s);
  }

  const bands = await resolveBands(schoolId, { classId: classId ?? exam.classId, examType: exam.type, scaleId: exam.gradingScaleId });
  const [scale] = exam.gradingScaleId
    ? await db.select().from(gradingScales).where(eq(gradingScales.id, exam.gradingScaleId)).limit(1)
    : await db.select().from(gradingScales).where(and(eq(gradingScales.schoolId, schoolId), eq(gradingScales.isDefault, true))).limit(1);

  const byStudent = new Map<string, ResultRow>();
  for (const s of studentById.values()) {
    byStudent.set(s.id, {
      studentId: s.id, admissionNo: s.admissionNo, nameEn: s.nameEn, nameNe: s.nameNe, rollNo: s.rollNo,
      subjects: [], totalMarks: 0, maxMarks: 0, percent: 0, gpa: 0,
      failedSubjects: 0, totalSubjects: 0, passed: true,
    });
  }

  for (const m of markRows) {
    const row = byStudent.get(m.studentId);
    const es = esById.get(m.examSubjectId);
    if (!row || !es) continue;
    const subj = subjectById.get(es.subjectId);
    const theory = Number(m.theoryObtained ?? 0);
    const practical = Number(m.practicalObtained ?? 0);
    const internal = Number(m.internalObtained ?? 0);
    const total = Number(m.total ?? 0);
    const maxTotal = es.theoryFull + es.practicalFull + es.internalFull;
    row.subjects.push({
      subjectId: es.subjectId,
      subjectNameEn: subj?.nameEn ?? 'Subject',
      subjectNameNe: subj?.nameNe ?? null,
      theory, practical, internal, total, maxTotal,
      percent: Number(m.percent ?? 0),
      gradeLetter: m.gradeLetter, gradePoint: Number(m.gradePoint ?? 0),
      isPassed: m.isPassed, isAbsent: m.isAbsent,
      creditHours: es.creditHours ?? subj?.creditHours ?? '1',
      remark: m.remark,
    });
    row.totalMarks += total;
    row.maxMarks += maxTotal;
  }

  const results: ResultRow[] = [];
  for (const row of byStudent.values()) {
    if (!row.subjects.length && !classId) continue; // only students with subject marks for school-wide exams
    row.totalSubjects = row.subjects.length;
    row.percent = row.maxMarks > 0 ? Math.round((row.totalMarks / row.maxMarks) * 10000) / 100 : 0;
    row.gpa = computeGpa(
      row.subjects.map((s) => ({ gradePoint: s.isAbsent ? null : s.gradePoint, creditHours: Number(s.creditHours) || 1 })),
      (scale?.gpaFormula as 'weighted' | 'average') ?? 'weighted',
    );
    const overall = overallResult(row.subjects.map((s) => ({
      total: s.total, maxTotal: s.maxTotal, percent: s.percent, gradeLetter: s.gradeLetter,
      gradePoint: s.gradePoint, isPassed: s.isPassed, isAbsent: s.isAbsent, remark: s.remark, ng: false,
    })));
    row.failedSubjects = overall.failedSubjects;
    row.passed = overall.passed;
    results.push(row);
  }

  results.sort((a, b) => b.gpa - a.gpa || b.percent - a.percent || (a.rollNo ?? 999) - (b.rollNo ?? 999));
  results.forEach((r, i) => { r.rank = i + 1; });

  return { exam, scale, results };
}

router.get('/:id/results', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const { exam, scale, results } = await buildResults(schoolId, req.params.id, req.query.classId ? String(req.query.classId) : null);
    const classRows = await db.select({ id: classTable.id, name: classTable.name }).from(classTable).where(eq(classTable.schoolId, schoolId));
    res.json({
      ok: true,
      data: results,
      meta: {
        exam: { id: exam.id, name: exam.name, type: exam.type, status: exam.status, publishedAt: exam.publishedAt },
        scale: scale ? { id: scale.id, name: scale.name, code: scale.code } : null,
        classes: classRows,
        summary: {
          students: results.length,
          passed: results.filter((r) => r.passed).length,
          failed: results.filter((r) => !r.passed).length,
          averageGpa: results.length ? Math.round((results.reduce((s, r) => s + r.gpa, 0) / results.length) * 100) / 100 : 0,
          averagePercent: results.length ? Math.round((results.reduce((s, r) => s + r.percent, 0) / results.length) * 100) / 100 : 0,
        },
      },
    });
  } catch (err) { next(err); }
});

/** Individual result / grade sheet data (student & parent portals). */
router.get('/:id/results/student/:studentId', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const classId = req.query.classId ? String(req.query.classId) : null;
    const { exam, scale, results } = await buildResults(schoolId, req.params.id, classId);
    const row = results.find((r) => r.studentId === req.params.studentId);
    if (!row) throw ApiError.notFound('Result not found for this student');

    // A student/parent may only view their own result
    if (['student', 'parent'].includes(req.auth!.role)) {
      const [me] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.schoolId, schoolId), eq(students.userId, req.auth!.id))).limit(1);
      if (!me || me.id !== req.params.studentId) throw ApiError.forbidden('You can only view your own result');
    }
    res.json({ ok: true, data: { ...row, exam: { id: exam.id, name: exam.name, type: exam.type, status: exam.status, publishedAt: exam.publishedAt }, scale: scale ? { name: scale.name, code: scale.code } : null } });
  } catch (err) { next(err); }
});

// ================= Publish / lock / reopen =================

function assertWriteRole(role: string) {
  if (!['super_admin', 'school_admin'].includes(role)) throw ApiError.forbidden('Only the administrator can publish or lock results');
}

router.post('/:id/publish', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    assertWriteRole(req.auth!.role);
    const schoolId = req.auth!.schoolId!;
    const [exam] = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, schoolId))).limit(1);
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.status === 'locked') throw ApiError.badRequest('Exam is locked');
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(marks)
      .innerJoin(examSubjects, eq(examSubjects.id, marks.examSubjectId))
      .where(eq(examSubjects.examId, exam.id));
    if (count === 0) throw ApiError.badRequest('No marks entered yet — nothing to publish');

    const [row] = await db.update(exams).set({
      status: 'published', publishedAt: new Date(), publishedBy: req.auth!.id, updatedAt: new Date(),
    }).where(eq(exams.id, exam.id)).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'publish_results', entity: 'exam', entityId: exam.id, detail: { name: exam.name, marks: count }, ip: req.ip });

    // Notify students/parents in-app
    const { notifications } = await import('../../db/schema/index.js');
    const classStudents = await db.select({ userId: students.userId }).from(students)
      .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')));
    const targets = classStudents.filter((s) => s.userId).map((s) => s.userId!);
    if (targets.length) {
      await db.insert(notifications).values(targets.slice(0, 1000).map((uid) => ({
        schoolId, userId: uid, channel: 'inapp', title: 'Result published',
        body: `The result for "${exam.name}" has been published. Open your dashboard to view it.`,
        status: 'sent', sentAt: new Date(), createdBy: req.auth!.id,
      })));
    }
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.post('/:id/lock', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    assertWriteRole(req.auth!.role);
    const [row] = await db.update(exams).set({ status: 'locked', lockedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Exam not found');
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'lock_results', entity: 'exam', entityId: row.id, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.post('/:id/unlock', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    assertWriteRole(req.auth!.role);
    const [exam] = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, req.auth!.schoolId!))).limit(1);
    if (!exam) throw ApiError.notFound('Exam not found');
    const [row] = await db.update(exams).set({ status: 'published', lockedAt: null, updatedAt: new Date() })
      .where(eq(exams.id, exam.id)).returning();
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'unlock_results', entity: 'exam', entityId: exam.id, detail: { reason: req.body?.reason ?? null }, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.post('/:id/reopen', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    assertWriteRole(req.auth!.role);
    const [exam] = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, req.auth!.schoolId!))).limit(1);
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.status === 'locked') throw ApiError.badRequest('Unlock the exam first');
    const [row] = await db.update(exams).set({ status: 'marks_entry', updatedAt: new Date() }).where(eq(exams.id, exam.id)).returning();
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'reopen_results', entity: 'exam', entityId: exam.id, detail: { reason: req.body?.reason ?? null }, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

// ================= Export =================

router.get('/:id/export', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const { results, exam } = await buildResults(schoolId, req.params.id, req.query.classId ? String(req.query.classId) : null);

    const maxSubjectCols = Math.max(1, ...results.map((r) => r.subjects.length));
    const cols: ExportColumn[] = [
      { key: 'rank', header: 'Rank' },
      { key: 'admissionNo', header: 'Admission No' },
      { key: 'rollNo', header: 'Roll No' },
      { key: 'nameEn', header: 'Name (English)' },
      { key: 'nameNe', header: 'Name (Nepali)' },
      ...Array.from({ length: maxSubjectCols }, (_, i) => ({ key: `sub${i}`, header: `Subject ${i + 1}` })),
      { key: 'totalMarks', header: 'Total Marks' },
      { key: 'maxMarks', header: 'Full Marks' },
      { key: 'percent', header: 'Percentage' },
      { key: 'gpa', header: 'GPA' },
      { key: 'result', header: 'Result' },
    ];
    const flat = results.map((r) => {
      const o: any = { ...r, result: r.passed ? 'PASS' : 'FAIL' };
      r.subjects.forEach((s, i) => {
        o[`sub${i}`] = `${s.subjectNameEn}: ${s.total}/${s.maxTotal} (${s.gradeLetter ?? '-'})`;
      });
      return o;
    });

    if (req.query.format === 'csv') {
      const csv = toCsv(flat, cols);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${exam.name.replace(/[^\w-]+/g, '_')}-results.csv"`);
      return res.send(csv);
    }
    const buf = await toXlsx(flat, cols, 'Results');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.name.replace(/[^\w-]+/g, '_')}-results.xlsx"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// ================= Exam routine =================

router.post('/:id/routine/generate', requireRole(...WRITE), validateBody(z.object({
  classId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysPerWeek: z.number().int().min(1).max(7).default(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  durationMinutes: z.number().int().min(30).max(300).default(180),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const p = req.body;
    const [exam] = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.id), eq(exams.schoolId, schoolId))).limit(1);
    if (!exam) throw ApiError.notFound('Exam not found');

    const subs = await db.select().from(examSubjects)
      .where(and(eq(examSubjects.examId, exam.id), eq(examSubjects.classId, p.classId)))
      .orderBy(asc(examSubjects.examDate), asc(examSubjects.subjectId));
    if (!subs.length) throw ApiError.badRequest('No exam subjects configured for this class');

    await db.delete(examRoutine).where(and(eq(examRoutine.examId, exam.id), eq(examRoutine.classId, p.classId)));

    const addMinutes = (start: string, mins: number) => {
      const [h, m] = start.split(':').map(Number);
      const total = h * 60 + m + mins;
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    };

    const rows: any[] = [];
    let dayOffset = 0;
    for (const s of subs) {
      let date = new Date(p.startDate + 'T00:00:00');
      date.setDate(date.getDate() + dayOffset);
      // skip Fridays? keep consecutive test days
      const dateStr = date.toISOString().slice(0, 10);
      const end = addMinutes(p.startTime, p.durationMinutes);
      rows.push({
        schoolId, examId: exam.id, classId: p.classId, date: dateStr,
        startTime: s.startTime ?? p.startTime, endTime: s.startTime ? addMinutes(s.startTime, p.durationMinutes) : end,
        subjectId: s.subjectId, room: s.room, invigilatorIds: s.invigilatorId ? [s.invigilatorId] : [],
      });
      dayOffset++;
      if (dayOffset >= p.daysPerWeek * 10) dayOffset = 0; // wrap safety
    }
    if (rows.length) await db.insert(examRoutine).values(rows);
    await audit(db, { schoolId, userId: req.auth!.id, action: 'generate_exam_routine', entity: 'exam', entityId: exam.id, detail: { slots: rows.length }, ip: req.ip });
    res.json({ ok: true, data: { slots: rows.length } });
  } catch (err) { next(err); }
});

router.get('/:id/routine', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: examRoutine.id, date: examRoutine.date, startTime: examRoutine.startTime, endTime: examRoutine.endTime,
        room: examRoutine.room, classId: examRoutine.classId, invigilatorIds: examRoutine.invigilatorIds,
        subjectNameEn: subjectTable.nameEn, subjectNameNe: subjectTable.nameNe, className: classTable.name,
      })
      .from(examRoutine)
      .leftJoin(subjectTable, eq(subjectTable.id, examRoutine.subjectId))
      .leftJoin(classTable, eq(classTable.id, examRoutine.classId))
      .where(and(eq(examRoutine.examId, req.params.id), eq(examRoutine.schoolId, req.auth!.schoolId!)))
      .orderBy(examRoutine.date, examRoutine.startTime);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

// ================= Attendance for exams (invigilation helper) =================

router.get('/:id/attendance', requireRole(...TEACH), async (req, res, next) => {
  try {
    const db = await getDb();
    const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
    const rows = await db
      .select({ studentId: studentAttendance.studentId, status: studentAttendance.status })
      .from(studentAttendance)
      .where(and(eq(studentAttendance.schoolId, req.auth!.schoolId!), eq(studentAttendance.date, date)));
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

export default router;
