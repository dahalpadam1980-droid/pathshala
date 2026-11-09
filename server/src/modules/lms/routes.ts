import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { materials, assignments, submissions, quizzes, quizQuestions, quizAttempts, students, employees, users, classes as classTable, subjects } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const ALL = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'] as const;
const TEACH = ['super_admin', 'school_admin', 'office', 'teacher'] as const;

/** Resolve the student profile for student-role callers. */
async function myStudent(schoolId: string, userId: string) {
  const db = await getDb();
  const [st] = await db.select().from(students)
    .where(and(eq(students.schoolId, schoolId), eq(students.userId, userId))).limit(1);
  return st ?? null;
}

// ================= Materials =================
router.get('/materials', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(materials.schoolId, schoolId), eq(materials.published, true)];
    if (req.query.classId) filters.push(eq(materials.classId, String(req.query.classId)));
    if (req.query.subjectId) filters.push(eq(materials.subjectId, String(req.query.subjectId)));
    if (req.query.type) filters.push(eq(materials.type, String(req.query.type)));
    if (req.query.q) filters.push(sql`(${materials.title} ILIKE ${'%' + req.query.q + '%'} OR ${materials.description} ILIKE ${'%' + req.query.q + '%'})`);
    if (['super_admin', 'school_admin', 'office', 'teacher'].includes(req.auth!.role)) {
      filters[1] = undefined as any;
      const f = filters.filter(Boolean);
      if (req.query.includeDrafts !== undefined) {
        const rows = await db.select({
          m: materials, className: classTable.name, subjectNameEn: subjects.nameEn,
          teacherName: users.nameEn,
        }).from(materials)
          .leftJoin(classTable, eq(classTable.id, materials.classId))
          .leftJoin(subjects, eq(subjects.id, materials.subjectId))
          .leftJoin(users, eq(users.id, materials.teacherId))
          .where(and(...f.filter((x) => x !== undefined)))
          .orderBy(desc(materials.createdAt)).limit(300);
        return res.json({ ok: true, data: rows.map(({ m, ...r }) => ({ ...m, ...r })) });
      }
      const rows = await db.select({
        m: materials, className: classTable.name, subjectNameEn: subjects.nameEn, teacherName: users.nameEn,
      }).from(materials)
        .leftJoin(classTable, eq(classTable.id, materials.classId))
        .leftJoin(subjects, eq(subjects.id, materials.subjectId))
        .leftJoin(users, eq(users.id, materials.teacherId))
        .where(and(...f))
        .orderBy(desc(materials.createdAt)).limit(300);
      return res.json({ ok: true, data: rows.map(({ m, ...r }) => ({ ...m, ...r })) });
    }
    const rows = await db.select({
      m: materials, className: classTable.name, subjectNameEn: subjects.nameEn, teacherName: users.nameEn,
    }).from(materials)
      .leftJoin(classTable, eq(classTable.id, materials.classId))
      .leftJoin(subjects, eq(subjects.id, materials.subjectId))
      .leftJoin(users, eq(users.id, materials.teacherId))
      .where(and(...filters.filter(Boolean)))
      .orderBy(desc(materials.createdAt)).limit(300);
    res.json({ ok: true, data: rows.map(({ m, ...r }) => ({ ...m, ...r })) });
  } catch (err) { next(err); }
});

router.post('/materials', requireRole(...TEACH), validateBody(z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  type: z.enum(['pdf', 'doc', 'ppt', 'video', 'audio', 'link', 'image']).default('pdf'),
  url: z.string().min(1).max(1000),
  classId: z.string().uuid().optional().nullable(),
  sectionId: z.string().uuid().optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  published: z.boolean().default(true),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(materials).values({
      ...req.body, schoolId: req.auth!.schoolId!, teacherId: req.auth!.id,
    }).returning();
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'create', entity: 'material', entityId: row.id, detail: { title: row.title }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.post('/materials/:id/download', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    await db.update(materials).set({ downloads: sql`${materials.downloads} + 1` }).where(eq(materials.id, req.params.id));
    res.json({ ok: true, data: { counted: true } });
  } catch (err) { next(err); }
});

router.delete('/materials/:id', requireRole(...TEACH), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(materials)
      .where(and(eq(materials.id, req.params.id), eq(materials.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Material not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Assignments =================
router.get('/assignments', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(assignments.schoolId, schoolId)];
    if (req.query.classId) filters.push(eq(assignments.classId, String(req.query.classId)));
    if (req.query.subjectId) filters.push(eq(assignments.subjectId, String(req.query.subjectId)));

    const rows = await db.select({
      a: assignments, className: classTable.name, subjectNameEn: subjects.nameEn, teacherName: users.nameEn,
      submissionCount: sql<number>`(select count(*)::int from ${submissions} where ${submissions.assignmentId} = ${assignments.id})`,
    }).from(assignments)
      .leftJoin(classTable, eq(classTable.id, assignments.classId))
      .leftJoin(subjects, eq(subjects.id, assignments.subjectId))
      .leftJoin(users, eq(users.id, assignments.teacherId))
      .where(and(...filters))
      .orderBy(desc(assignments.createdAt)).limit(300);

    // For students: attach own submission status
    let mySubs: Map<string, any> = new Map();
    if (req.auth!.role === 'student') {
      const me = await myStudent(schoolId, req.auth!.id);
      if (me) {
        const subs = await db.select().from(submissions).where(eq(submissions.studentId, me.id));
        mySubs = new Map(subs.map((s) => [s.assignmentId, s]));
      }
    }
    res.json({
      ok: true,
      data: rows.map(({ a, ...rest }) => ({
        ...a, ...rest,
        mySubmission: mySubs.get(a.id) ?? null,
      })),
    });
  } catch (err) { next(err); }
});

router.post('/assignments', requireRole(...TEACH), validateBody(z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional().nullable(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid().optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  totalMarks: z.number().int().min(0).max(1000).default(100),
  attachmentUrl: z.string().max(1000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(assignments).values({
      ...req.body, schoolId: req.auth!.schoolId!, teacherId: req.auth!.id,
    }).returning();
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'create', entity: 'assignment', entityId: row.id, detail: { title: row.title }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/assignments/:id', requireRole(...TEACH), validateBody(z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10000).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  totalMarks: z.number().int().min(0).max(1000).optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(assignments).set(req.body)
      .where(and(eq(assignments.id, req.params.id), eq(assignments.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Assignment not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/assignments/:id', requireRole(...TEACH), async (req, res, next) => {
  try {
    const db = await getDb();
    await db.delete(submissions).where(eq(submissions.assignmentId, req.params.id));
    const [row] = await db.delete(assignments)
      .where(and(eq(assignments.id, req.params.id), eq(assignments.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Assignment not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

router.get('/assignments/:id/submissions', requireRole(...TEACH), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select({
      id: submissions.id, studentId: submissions.studentId, fileUrl: submissions.fileUrl, note: submissions.note,
      submittedAt: submissions.submittedAt, status: submissions.status, marksObtained: submissions.marksObtained,
      feedback: submissions.feedback,
      studentName: students.nameEn, admissionNo: students.admissionNo, rollNo: students.rollNo,
    }).from(submissions)
      .innerJoin(students, eq(students.id, submissions.studentId))
      .where(eq(submissions.assignmentId, req.params.id))
      .orderBy(asc(students.rollNo));
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/assignments/:id/submit', requireRole(...ALL), validateBody(z.object({
  fileUrl: z.string().max(1000).optional().nullable(),
  note: z.string().max(3000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    if (req.auth!.role !== 'student') throw ApiError.forbidden('Only students can submit assignments');
    const me = await myStudent(schoolId, req.auth!.id);
    if (!me) throw ApiError.notFound('Student profile not linked to your account');
    const [assignment] = await db.select().from(assignments)
      .where(and(eq(assignments.id, req.params.id), eq(assignments.schoolId, schoolId))).limit(1);
    if (!assignment) throw ApiError.notFound('Assignment not found');
    if (!req.body.fileUrl && !req.body.note) throw ApiError.badRequest('Provide a file or a note with your submission');

    const [existing] = await db.select({ id: submissions.id }).from(submissions)
      .where(and(eq(submissions.assignmentId, assignment.id), eq(submissions.studentId, me.id))).limit(1);
    const late = assignment.dueDate ? new Date() > new Date(assignment.dueDate + 'T23:59:59') : false;

    let row: any;
    if (existing) {
      [row] = await db.update(submissions).set({
        fileUrl: req.body.fileUrl ?? null, note: req.body.note ?? null,
        submittedAt: new Date(), status: late ? 'late' : 'submitted',
      }).where(eq(submissions.id, existing.id)).returning();
    } else {
      [row] = await db.insert(submissions).values({
        assignmentId: assignment.id, schoolId, studentId: me.id,
        fileUrl: req.body.fileUrl ?? null, note: req.body.note ?? null,
        status: late ? 'late' : 'submitted',
      }).returning();
    }
    res.status(201).json({ ok: true, data: { ...row, late } });
  } catch (err) { next(err); }
});

router.post('/submissions/:id/grade', requireRole(...TEACH), validateBody(z.object({
  marksObtained: z.number().int().min(0).max(1000),
  feedback: z.string().max(3000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(submissions).set({
      marksObtained: req.body.marksObtained, feedback: req.body.feedback ?? null,
      gradedAt: new Date(), gradedBy: req.auth!.id, status: 'graded',
    } as any).where(and(eq(submissions.id, req.params.id), eq(submissions.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Submission not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

// ================= Quizzes =================
router.get('/quizzes', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(quizzes.schoolId, schoolId)];
    if (req.query.classId) filters.push(eq(quizzes.classId, String(req.query.classId)));
    const rows = await db.select({
      q: quizzes, className: classTable.name, subjectNameEn: subjects.nameEn,
      questionCount: sql<number>`(select count(*)::int from ${quizQuestions} where ${quizQuestions.quizId} = ${quizzes.id})`,
    }).from(quizzes)
      .leftJoin(classTable, eq(classTable.id, quizzes.classId))
      .leftJoin(subjects, eq(subjects.id, quizzes.subjectId))
      .where(and(...filters))
      .orderBy(desc(quizzes.createdAt)).limit(200);
    res.json({ ok: true, data: rows.map(({ q, ...r }) => ({ ...q, ...r })) });
  } catch (err) { next(err); }
});

router.post('/quizzes', requireRole(...TEACH), validateBody(z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid().optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  timeLimitMinutes: z.number().int().min(1).max(600).default(30),
  opensAt: z.string().datetime().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
  questions: z.array(z.object({
    type: z.enum(['mcq', 'short']).default('mcq'),
    question: z.string().min(1).max(3000),
    options: z.array(z.string().max(500)).max(8).default([]),
    correctIndex: z.number().int().min(-1).max(8).optional().nullable(),
    correctAnswer: z.string().max(500).optional().nullable(),
    marks: z.number().int().min(1).max(100).default(1),
  })).min(1).max(100),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const { questions, ...quizBody } = req.body;
    const totalMarks = (questions as any[]).reduce((s: number, q: any) => s + Number(q.marks ?? 0), 0);
    const [quiz] = await db.insert(quizzes).values({
      ...quizBody, schoolId: req.auth!.schoolId!, teacherId: req.auth!.id, totalMarks,
    }).returning();
    await db.insert(quizQuestions).values((questions as any[]).map((q: any, i: number) => ({
      quizId: quiz.id, type: q.type, question: q.question, options: q.options,
      correctIndex: q.correctIndex ?? null, correctAnswer: q.correctAnswer ?? null,
      marks: q.marks, sortOrder: i,
    })));
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'create', entity: 'quiz', entityId: quiz.id, detail: { title: quiz.title, questions: questions.length }, ip: req.ip });
    res.status(201).json({ ok: true, data: quiz });
  } catch (err) { next(err); }
});

/** Attempt a quiz: get questions (correct answers hidden from students). */
router.get('/quizzes/:id/attempt', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [quiz] = await db.select().from(quizzes)
      .where(and(eq(quizzes.id, req.params.id), eq(quizzes.schoolId, schoolId))).limit(1);
    if (!quiz) throw ApiError.notFound('Quiz not found');
    const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id)).orderBy(asc(quizQuestions.sortOrder));
    const isStudent = req.auth!.role === 'student';
    let attempt: any = null;
    if (isStudent) {
      const me = await myStudent(schoolId, req.auth!.id);
      if (me) {
        const [a] = await db.select().from(quizAttempts)
          .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.studentId, me.id))).limit(1);
        attempt = a ?? null;
      }
    }
    res.json({
      ok: true,
      data: {
        quiz,
        questions: qs.map((q) => ({
          id: q.id, type: q.type, question: q.question,
          options: q.options, marks: q.marks,
          ...(isStudent ? {} : { correctIndex: q.correctIndex, correctAnswer: q.correctAnswer }),
        })),
        attempt: attempt ? { ...attempt, answers: attempt.answers, submitted: !!attempt.submittedAt } : null,
      },
    });
  } catch (err) { next(err); }
});

router.post('/quizzes/:id/submit', requireRole(...ALL), validateBody(z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    if (req.auth!.role !== 'student') throw ApiError.forbidden('Only students can attempt quizzes');
    const me = await myStudent(schoolId, req.auth!.id);
    if (!me) throw ApiError.notFound('Student profile not linked');
    const [quiz] = await db.select().from(quizzes)
      .where(and(eq(quizzes.id, req.params.id), eq(quizzes.schoolId, schoolId))).limit(1);
    if (!quiz) throw ApiError.notFound('Quiz not found');

    const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id));
    let score = 0;
    let maxScore = 0;
    for (const q of qs) {
      maxScore += q.marks;
      const given = req.body.answers[q.id];
      if (q.type === 'mcq' && q.correctIndex != null && given !== undefined && Number(given) === q.correctIndex) {
        score += q.marks;
      } else if (q.type === 'short' && q.correctAnswer && typeof given === 'string' &&
        given.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()) {
        score += q.marks;
      }
    }

    const [existing] = await db.select({ id: quizAttempts.id }).from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.studentId, me.id))).limit(1);
    let row: any;
    if (existing) {
      if (existing) {
        const [prev] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, existing.id)).limit(1);
        if (prev?.submittedAt) throw ApiError.badRequest('You have already submitted this quiz');
      }
      [row] = await db.update(quizAttempts).set({
        answers: req.body.answers, score, maxScore, submittedAt: new Date(), autoEvaluated: true,
      }).where(eq(quizAttempts.id, existing.id)).returning();
    } else {
      [row] = await db.insert(quizAttempts).values({
        quizId: quiz.id, schoolId, studentId: me.id,
        answers: req.body.answers, score, maxScore, submittedAt: new Date(), autoEvaluated: true,
      }).returning();
    }
    res.json({ ok: true, data: { score, maxScore, percent: maxScore ? Math.round((score / maxScore) * 100) : 0 } });
  } catch (err) { next(err); }
});

router.delete('/quizzes/:id', requireRole(...TEACH), async (req, res, next) => {
  try {
    const db = await getDb();
    await db.delete(quizAttempts).where(eq(quizAttempts.quizId, req.params.id));
    await db.delete(quizQuestions).where(eq(quizQuestions.quizId, req.params.id));
    const [row] = await db.delete(quizzes)
      .where(and(eq(quizzes.id, req.params.id), eq(quizzes.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Quiz not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

export default router;
