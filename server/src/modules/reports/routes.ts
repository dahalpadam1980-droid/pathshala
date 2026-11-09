import { Router } from 'express';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  students, classes, sections, subjects, employees, studentAttendance,
  exams, examSubjects, marks, studentFees, payments, notices, books, bookIssues, assets,
} from '../../db/schema/index.js';
import { authenticate, requireSchool } from '../../middleware/auth.js';
import { ApiError } from '../../lib/errors.js';
import { currentAcademicYear } from '../academics/helpers.js';

const router = Router();
router.use(authenticate, requireSchool);

/** GET /reports/overview — numbers for the dashboard cards */
router.get('/overview', async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const year = await currentAcademicYear(schoolId);

  const [studentCount] = await db
    .select({ value: count() })
    .from(students)
    .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')));
  const [teacherCount] = await db
    .select({ value: count() })
    .from(employees)
    .where(and(eq(employees.schoolId, schoolId), eq(employees.isTeacher, true), eq(employees.status, 'active')));
  const [employeeCount] = await db
    .select({ value: count() })
    .from(employees)
    .where(and(eq(employees.schoolId, schoolId), eq(employees.status, 'active')));
  const [classCount] = await db
    .select({ value: count() })
    .from(classes)
    .where(eq(classes.schoolId, schoolId));

  let feeSummary = { collected: 0, due: 0, outstanding: 0 };
  if (year) {
    const [agg] = await db
      .select({
        billed: sql<string>`coalesce(sum(${studentFees.amount} + ${studentFees.fine} - ${studentFees.discount}), 0)`,
        paid: sql<string>`coalesce(sum(${studentFees.paidAmount}), 0)`,
      })
      .from(studentFees)
      .where(and(eq(studentFees.schoolId, schoolId), eq(studentFees.academicYearId, year.id)));
    const billed = Number(agg?.billed ?? 0);
    const paid = Number(agg?.paid ?? 0);
    feeSummary = { collected: paid, due: billed, outstanding: billed - paid };
  }

  const today = new Date().toISOString().slice(0, 10);
  const [todayAtt] = await db
    .select({
      total: count(),
      present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'present')`,
    })
    .from(studentAttendance)
    .where(and(eq(studentAttendance.schoolId, schoolId), eq(studentAttendance.date, today)));
  const [openNotices] = await db
    .select({ value: count() })
    .from(notices)
    .where(and(eq(notices.schoolId, schoolId), eq(notices.status, 'published')));

  const byClass = await db
    .select({ className: classes.name, value: count() })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')))
    .groupBy(classes.name)
    .orderBy(asc(classes.name));

  res.json({
    ok: true,
    data: {
      academicYear: year
        ? { id: year.id, name: year.name, startAd: year.startAd, endAd: year.endAd, startBs: year.startBs, endBs: year.endBs, isCurrent: year.isCurrent }
        : null,
      students: studentCount?.value ?? 0,
      teachers: teacherCount?.value ?? 0,
      employees: employeeCount?.value ?? 0,
      classes: classCount?.value ?? 0,
      fees: feeSummary,
      attendanceToday: todayAtt
        ? {
            total: todayAtt.total,
            present: Number(todayAtt.present),
            percent: todayAtt.total ? Math.round((Number(todayAtt.present) / todayAtt.total) * 100) : 0,
          }
        : { total: 0, present: 0, percent: 0 },
      publishedNotices: openNotices?.value ?? 0,
      studentsByClass: byClass.map((r) => ({ class: r.className, count: Number(r.value) })),
    },
  });
});

/** GET /reports/attendance?month=YYYY-MM&classId=&sectionId= */
router.get('/attendance', async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const month = typeof req.query.month === 'string' ? req.query.month : new Date().toISOString().slice(0, 7);
  const conditions = [
    eq(studentAttendance.schoolId, schoolId),
    sql`to_char(${studentAttendance.date}::date, 'YYYY-MM') = ${month}`,
  ];
  if (typeof req.query.classId === 'string' && req.query.classId) conditions.push(eq(students.classId, req.query.classId));
  if (typeof req.query.sectionId === 'string' && req.query.sectionId) conditions.push(eq(students.sectionId, req.query.sectionId));

  const rows = await db
    .select({
      studentId: students.id,
      roll: students.rollNo,
      name: students.nameEn,
      className: classes.name,
      sectionName: sections.name,
      total: count(),
      present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'present')`,
      absent: sql<number>`count(*) filter (where ${studentAttendance.status} = 'absent')`,
      late: sql<number>`count(*) filter (where ${studentAttendance.status} = 'late')`,
      leave_: sql<number>`count(*) filter (where ${studentAttendance.status} = 'leave')`,
    })
    .from(studentAttendance)
    .innerJoin(students, eq(studentAttendance.studentId, students.id))
    .leftJoin(classes, eq(students.classId, classes.id))
    .leftJoin(sections, eq(students.sectionId, sections.id))
    .where(and(...conditions))
    .groupBy(students.id, students.rollNo, students.nameEn, classes.name, sections.name)
    .orderBy(classes.name, students.rollNo);

  res.json({
    ok: true,
    data: rows.map((r) => {
      const total = r.total;
      return {
        studentId: r.studentId,
        roll: r.roll,
        name: r.name,
        class: r.className,
        section: r.sectionName,
        total,
        present: Number(r.present),
        absent: Number(r.absent),
        late: Number(r.late),
        leave: Number(r.leave_),
        percent: total ? Math.round((Number(r.present) / total) * 1000) / 10 : 0,
      };
    }),
    meta: { month },
  });
});

/** GET /reports/exams?examId= — subject/class performance summary */
router.get('/exams', async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const examId = typeof req.query.examId === 'string' ? req.query.examId : '';
  const exam = examId
    ? (await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.schoolId, schoolId))).limit(1))[0]
    : (await db.select().from(exams).where(eq(exams.schoolId, schoolId)).orderBy(desc(exams.createdAt)).limit(1))[0];
  if (!exam) throw ApiError.notFound('No exams found');

  const subRows = await db
    .select({
      id: examSubjects.id,
      subjectName: subjects.nameEn,
      subjectCode: subjects.code,
      theoryFull: examSubjects.theoryFull,
      practicalFull: examSubjects.practicalFull,
      internalFull: examSubjects.internalFull,
    })
    .from(examSubjects)
    .leftJoin(subjects, eq(examSubjects.subjectId, subjects.id))
    .where(and(eq(examSubjects.schoolId, schoolId), eq(examSubjects.examId, exam.id)));
  const subIds = subRows.map((s) => s.id);

  const summary = {
    marksEntered: 0,
    pass: 0,
    fail: 0,
    overallPercent: 0,
    subjects: [] as Array<{
      subject: string;
      average: number;
      passPercent: number;
      highest: number;
      lowest: number;
      maxMarks: number;
    }>,
    classes: [] as Array<{ className: string; average: number; students: number }>,
  };
  if (subIds.length === 0) {
    res.json({ ok: true, data: { exam: { id: exam.id, name: exam.name }, summary } });
    return;
  }

  const markRows = await db
    .select({
      subId: marks.examSubjectId,
      percent: marks.percent,
      isPassed: marks.isPassed,
      isAbsent: marks.isAbsent,
      studentId: students.id,
      className: classes.name,
    })
    .from(marks)
    .innerJoin(students, eq(marks.studentId, students.id))
    .leftJoin(classes, eq(students.classId, classes.id))
    .where(and(eq(marks.schoolId, schoolId), inArray(marks.examSubjectId, subIds)));

  const subById = new Map(subRows.map((s) => [s.id, s]));
  const subLabel = (s: { subjectName: string | null; subjectCode: string | null }) =>
    `${s.subjectCode ?? ''} ${s.subjectName ?? ''}`.trim() || 'Subject';
  const bySubject = new Map<string, number[]>();
  const passBySubject = new Map<string, number>();
  const byClass = new Map<string, { sum: number; students: Set<string> }>();

  let pctSum = 0;
  let graded = 0;
  let pass = 0;
  for (const r of markRows) {
    const sub = subById.get(r.subId);
    const name: string = sub ? subLabel(sub) : 'Subject';
    const pct = Number(r.percent ?? 0);
    const arr = bySubject.get(name) ?? [];
    arr.push(pct);
    bySubject.set(name, arr);
    if (r.isPassed) passBySubject.set(name, (passBySubject.get(name) ?? 0) + 1);
    if (r.className) {
      const cur = byClass.get(r.className) ?? { sum: 0, students: new Set<string>() };
      cur.sum += pct;
      cur.students.add(r.studentId);
      byClass.set(r.className, cur);
    }
    pctSum += pct;
    graded += 1;
    if (r.isPassed) pass += 1;
  }

  summary.marksEntered = graded;
  summary.pass = pass;
  summary.fail = graded - pass;
  summary.overallPercent = graded ? Math.round((pctSum / graded) * 10) / 10 : 0;
  summary.subjects = [...bySubject.entries()].map(([subject, pcts]) => {
    const sub = [...subById.values()].find((s) => subLabel(s) === subject);
    const maxMarks = sub ? sub.theoryFull + sub.practicalFull + sub.internalFull : 100;
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    return {
      subject,
      average: Math.round(avg * 10) / 10,
      passPercent: pcts.length ? Math.round(((passBySubject.get(subject) ?? 0) / pcts.length) * 100) : 0,
      highest: Math.round(Math.max(...pcts) * 10) / 10,
      lowest: Math.round(Math.min(...pcts) * 10) / 10,
      maxMarks,
    };
  });
  summary.classes = [...byClass.entries()].map(([className, v]) => ({
    className,
    average: v.students.size ? Math.round((v.sum / v.students.size) * 10) / 10 : 0,
    students: v.students.size,
  }));

  res.json({ ok: true, data: { exam: { id: exam.id, name: exam.name, type: exam.type }, summary } });
});

/** GET /reports/fees — billed vs collected by class for the current year */
router.get('/fees', async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const year = await currentAcademicYear(schoolId);
  if (!year) throw ApiError.notFound('No active academic year');

  const rows = await db
    .select({
      className: classes.name,
      studentId: students.id,
      billed: sql<string>`coalesce(sum(${studentFees.amount} + ${studentFees.fine} - ${studentFees.discount}), 0)`,
      collected: sql<string>`coalesce(sum(${studentFees.paidAmount}), 0)`,
    })
    .from(studentFees)
    .innerJoin(students, eq(studentFees.studentId, students.id))
    .leftJoin(classes, eq(students.classId, classes.id))
    .where(and(eq(studentFees.schoolId, schoolId), eq(studentFees.academicYearId, year.id)))
    .groupBy(classes.name, students.id);

  const byClass = new Map<string, { className: string; billed: number; collected: number }>();
  for (const r of rows) {
    const key = r.className ?? 'Unassigned';
    const cur = byClass.get(key) ?? { className: key, billed: 0, collected: 0 };
    cur.billed += Number(r.billed);
    cur.collected += Number(r.collected);
    byClass.set(key, cur);
  }

  const totalBilled = [...byClass.values()].reduce((a, b) => a + b.billed, 0);
  const totalCollected = [...byClass.values()].reduce((a, b) => a + b.collected, 0);

  const [paymentCount] = await db
    .select({ value: count() })
    .from(payments)
    .where(eq(payments.schoolId, schoolId));

  res.json({
    ok: true,
    data: {
      academicYear: { id: year.id, name: year.name },
      byClass: [...byClass.values()].sort((a, b) => a.className.localeCompare(b.className)),
      totals: {
        billed: Math.round(totalBilled * 100) / 100,
        collected: Math.round(totalCollected * 100) / 100,
        outstanding: Math.round((totalBilled - totalCollected) * 100) / 100,
        receipts: paymentCount?.value ?? 0,
      },
    },
  });
});

/** GET /reports/library — catalogue + overdue issues */
router.get('/library', async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const [bookCount] = await db.select({ value: count() }).from(books).where(eq(books.schoolId, schoolId));
  const [issued] = await db
    .select({ value: count() })
    .from(bookIssues)
    .where(and(eq(bookIssues.schoolId, schoolId), sql`${bookIssues.returnedAt} is null`));
  const overdue = await db
    .select({
      id: bookIssues.id,
      dueDate: bookIssues.dueDate,
      issuedToType: bookIssues.issuedToType,
      bookTitle: books.title,
      borrowerName: sql<string>`coalesce(${students.nameEn}, ${employees.nameEn}, '—')`,
    })
    .from(bookIssues)
    .leftJoin(books, eq(bookIssues.bookId, books.id))
    .leftJoin(students, sql`${bookIssues.issuedToType} = 'student' and ${bookIssues.issuedToId} = ${students.id}`)
    .leftJoin(employees, sql`${bookIssues.issuedToType} = 'employee' and ${bookIssues.issuedToId} = ${employees.id}`)
    .where(and(eq(bookIssues.schoolId, schoolId), sql`${bookIssues.returnedAt} is null`, sql`${bookIssues.dueDate} < current_date`))
    .orderBy(asc(bookIssues.dueDate));
  res.json({ ok: true, data: { books: bookCount?.value ?? 0, issued: issued?.value ?? 0, overdue } });
});

/** GET /reports/inventory — asset counts, condition, value */
router.get('/inventory', async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const items = await db.select().from(assets).where(eq(assets.schoolId, schoolId)).orderBy(asc(assets.name));
  const byCategory = new Map<string, number>();
  let stockValue = 0;
  let damaged = 0;
  for (const i of items) {
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.quantity);
    stockValue += i.quantity * Number(i.purchaseCost ?? 0);
    if (i.condition === 'damaged' || i.condition === 'lost') damaged += 1;
  }
  res.json({
    ok: true,
    data: {
      items: items.length,
      units: items.reduce((a, i) => a + i.quantity, 0),
      damagedOrLost: damaged,
      stockValue: Math.round(stockValue * 100) / 100,
      byCategory: [...byCategory.entries()].map(([category, quantity]) => ({ category, quantity })),
    },
  });
});

export default router;
