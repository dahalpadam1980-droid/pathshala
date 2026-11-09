import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { studentAttendance, employeeAttendance, students, employees, sections, classes, users } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { monthEndKey } from '../../lib/bsdate.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const READ = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher'] as const;
const MARK = ['super_admin', 'school_admin', 'office', 'teacher'] as const;
const STUDENT_STATUS = ['present', 'absent', 'late', 'leave'] as const;
const EMPLOYEE_STATUS = ['present', 'absent', 'late', 'leave', 'on_duty', 'half_day'] as const;

// ---------------- Student attendance ----------------

/** Roster + existing marks for a section on a date. */
router.get('/students', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
    const sectionId = req.query.sectionId ? String(req.query.sectionId) : null;

    const filters: any[] = [eq(students.schoolId, schoolId), eq(students.status, 'active')];
    if (sectionId) filters.push(eq(students.sectionId, sectionId));
    if (req.query.classId) filters.push(eq(students.classId, String(req.query.classId)));

    const roster = await db
      .select({
        id: students.id, admissionNo: students.admissionNo, nameEn: students.nameEn, nameNe: students.nameNe,
        rollNo: students.rollNo, gender: students.gender, sectionId: students.sectionId, classId: students.classId,
        photoUrl: students.photoUrl, className: classes.name, sectionName: sections.name,
      })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(and(...filters))
      .orderBy(asc(students.rollNo), asc(students.nameEn));

    const marks = await db
      .select()
      .from(studentAttendance)
      .where(and(
        eq(studentAttendance.schoolId, schoolId),
        eq(studentAttendance.date, date),
        ...(req.query.subjectId ? [eq(studentAttendance.subjectId, String(req.query.subjectId))] : []),
      ));
    const markByStudent = new Map(marks.map((m) => [`${m.studentId}:${m.subjectId ?? ''}`, m]));

    const data = roster.map((s) => {
      const key = `${s.id}:${req.query.subjectId ? String(req.query.subjectId) : ''}`;
      const mark = markByStudent.get(key) ?? null;
      return { ...s, status: mark?.status ?? null, markedAt: mark?.createdAt ?? null, remarks: mark?.remarks ?? null };
    });

    const summary = {
      total: data.length,
      present: data.filter((d) => d.status === 'present' || d.status === 'late').length,
      absent: data.filter((d) => d.status === 'absent').length,
      leave: data.filter((d) => d.status === 'leave').length,
      unmarked: data.filter((d) => d.status === null).length,
    };
    res.json({ ok: true, data, meta: { date, summary } });
  } catch (err) { next(err); }
});

router.post('/students/mark', requireRole(...MARK), validateBody(z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sectionId: z.string().uuid().optional().nullable(),
  subjectId: z.string().uuid().optional().nullable(),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(STUDENT_STATUS),
    remarks: z.string().max(300).optional().nullable(),
  })).min(1).max(500),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const { date, sectionId, subjectId, records } = req.body;

    let saved = 0;
    for (const r of records) {
      const [st] = await db.select({ id: students.id, sectionId: students.sectionId })
        .from(students).where(and(eq(students.id, r.studentId), eq(students.schoolId, schoolId))).limit(1);
      if (!st) continue;

      const [existing] = await db.select({ id: studentAttendance.id, markedBy: studentAttendance.markedBy })
        .from(studentAttendance)
        .where(and(
          eq(studentAttendance.date, date),
          eq(studentAttendance.studentId, r.studentId),
          subjectId ? eq(studentAttendance.subjectId, subjectId) : sql`${studentAttendance.subjectId} is null`,
        ))
        .limit(1);

      if (existing) {
        await db.update(studentAttendance).set({
          status: r.status, remarks: r.remarks ?? null, correctedAt: new Date(),
        }).where(eq(studentAttendance.id, existing.id));
      } else {
        await db.insert(studentAttendance).values({
          schoolId, date, sectionId: sectionId ?? st.sectionId, subjectId: subjectId ?? null,
          studentId: r.studentId, status: r.status, remarks: r.remarks ?? null, markedBy: req.auth!.id,
        });
      }
      saved++;
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'mark_attendance', entity: 'student_attendance', detail: { date, sectionId, count: saved }, ip: req.ip });
    res.json({ ok: true, data: { saved } });
  } catch (err) { next(err); }
});

/** Monthly attendance percentage per student. */
router.get('/students/monthly', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const rawMonth = String(req.query.month ?? new Date().toISOString().slice(0, 7)); // YYYY-MM
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : new Date().toISOString().slice(0, 7);
    const [from, to] = [`${month}-01`, monthEndKey(month)];
    const filters: any[] = [
      eq(studentAttendance.schoolId, schoolId),
      sql`${studentAttendance.date} >= ${from}`,
      sql`${studentAttendance.date} <= ${to}`,
    ];
    if (req.query.classId) filters.push(eq(students.classId, String(req.query.classId)));
    if (req.query.sectionId) filters.push(eq(students.sectionId, String(req.query.sectionId)));

    const rows = await db
      .select({
        studentId: students.id, nameEn: students.nameEn, admissionNo: students.admissionNo,
        rollNo: students.rollNo, className: classes.name, sectionName: sections.name,
        present: sql<number>`count(*) filter (where ${studentAttendance.status} = 'present')::int`,
        late: sql<number>`count(*) filter (where ${studentAttendance.status} = 'late')::int`,
        absent: sql<number>`count(*) filter (where ${studentAttendance.status} = 'absent')::int`,
        leave: sql<number>`count(*) filter (where ${studentAttendance.status} = 'leave')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(studentAttendance)
      .innerJoin(students, eq(students.id, studentAttendance.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(and(...filters))
      .groupBy(students.id, students.nameEn, students.admissionNo, students.rollNo, classes.name, sections.name)
      .orderBy(asc(students.rollNo));

    const data = rows.map((r) => {
      const attended = r.present + r.late;
      const percentage = r.total > 0 ? Math.round((attended / r.total) * 1000) / 10 : 0;
      return { ...r, percentage, attended };
    });
    res.json({ ok: true, data, meta: { month, students: data.length } });
  } catch (err) { next(err); }
});

/** Attendance for the signed-in student (or a parent's children). */
router.get('/my', requireRole('student', 'parent'), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const rawMonth = String(req.query.month ?? new Date().toISOString().slice(0, 7));
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : new Date().toISOString().slice(0, 7);
    const [from, to] = [`${month}-01`, monthEndKey(month)];

    const [me] = await db
      .select({ nameEn: users.nameEn, phone: users.phone })
      .from(users)
      .where(eq(users.id, req.auth!.id))
      .limit(1);

    const mine = await db
      .select({ id: students.id, nameEn: students.nameEn, nameNe: students.nameNe, rollNo: students.rollNo })
      .from(students)
      .where(
        and(
          eq(students.schoolId, schoolId),
          req.auth!.role === 'student'
            ? eq(students.userId, req.auth!.id)
            : or(
                me?.nameEn ? eq(students.fatherName, me.nameEn) : sql`false`,
                me?.nameEn ? eq(students.motherName, me.nameEn) : sql`false`,
                me?.nameEn ? eq(students.guardianName, me.nameEn) : sql`false`,
                me?.phone ? eq(students.fatherPhone, me.phone) : sql`false`,
                me?.phone ? eq(students.motherPhone, me.phone) : sql`false`,
                me?.phone ? eq(students.guardianPhone, me.phone) : sql`false`,
              )!,
        ),
      );

    const ids = mine.map((m) => m.id);
    const rows = ids.length
      ? await db
          .select({
            studentId: studentAttendance.studentId,
            date: studentAttendance.date,
            status: studentAttendance.status,
          })
          .from(studentAttendance)
          .where(
            and(
              eq(studentAttendance.schoolId, schoolId),
              sql`${studentAttendance.date} >= ${from}`,
              sql`${studentAttendance.date} <= ${to}`,
              sql`${studentAttendance.studentId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`,
            ),
          )
      : [];

    const data = mine.map((m) => {
      const own = rows.filter((r) => r.studentId === m.id);
      const present = own.filter((r) => r.status === 'present').length;
      const late = own.filter((r) => r.status === 'late').length;
      const absent = own.filter((r) => r.status === 'absent').length;
      const leave = own.filter((r) => r.status === 'leave').length;
      const total = own.length;
      return {
        studentId: m.id,
        nameEn: m.nameEn,
        nameNe: m.nameNe,
        rollNo: m.rollNo,
        present,
        late,
        absent,
        leave,
        total,
        attended: present + late,
        percentage: total ? Math.round(((present + late) / total) * 1000) / 10 : 0,
        days: own.map((r) => ({ date: r.date, status: r.status })),
      };
    });

    res.json({ ok: true, data, meta: { month } });
  } catch (err) {
    next(err);
  }
});

/** Notify guardians about absences (records a notification; SMS sent if gateway configured). */
router.post('/students/notify-absent', requireRole(...MARK), validateBody(z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sectionId: z.string().uuid().optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const { notifications } = await import('../../db/schema/index.js');
    const filters: any[] = [
      eq(studentAttendance.schoolId, schoolId),
      eq(studentAttendance.date, req.body.date),
      eq(studentAttendance.status, 'absent'),
    ];
    if (req.body.sectionId) filters.push(eq(studentAttendance.sectionId, req.body.sectionId));
    const absentees = await db
      .select({ nameEn: students.nameEn, guardianPhone: students.guardianPhone, fatherPhone: students.fatherPhone })
      .from(studentAttendance)
      .innerJoin(students, eq(students.id, studentAttendance.studentId))
      .where(and(...filters));

    let queued = 0;
    for (const a of absentees) {
      const phone = a.guardianPhone ?? a.fatherPhone;
      if (!phone) continue;
      await db.insert(notifications).values({
        schoolId, channel: 'sms', title: 'Attendance alert',
        body: `Dear guardian, ${a.nameEn} was marked ABSENT on ${req.body.date}. Please contact the school if this is incorrect.`,
        status: process.env.SMS_API_URL ? 'pending' : 'failed',
        error: process.env.SMS_API_URL ? null : 'SMS gateway not configured',
        meta: { phone }, createdBy: req.auth!.id,
      });
      queued++;
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'notify_absent', entity: 'notification', detail: { date: req.body.date, queued }, ip: req.ip });
    res.json({ ok: true, data: { queued, gateway: process.env.SMS_API_URL ? 'configured' : 'not_configured' } });
  } catch (err) { next(err); }
});

// ---------------- Employee attendance ----------------

router.get('/employees', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));

    const roster = await db
      .select({
        id: employees.id, empCode: employees.empCode, nameEn: employees.nameEn, nameNe: employees.nameNe,
        designation: employees.designation, isTeacher: employees.isTeacher, photoUrl: employees.photoUrl,
      })
      .from(employees)
      .where(and(eq(employees.schoolId, schoolId), eq(employees.status, 'active')))
      .orderBy(asc(employees.nameEn));

    const marks = await db.select().from(employeeAttendance)
      .where(and(eq(employeeAttendance.schoolId, schoolId), eq(employeeAttendance.date, date)));
    const byId = new Map(marks.map((m) => [m.employeeId, m]));

    const data = roster.map((e) => {
      const mark = byId.get(e.id) ?? null;
      return { ...e, status: mark?.status ?? null, checkIn: mark?.checkIn ?? null, checkOut: mark?.checkOut ?? null, method: mark?.method ?? null };
    });
    const summary = {
      total: data.length,
      present: data.filter((d) => d.status === 'present').length,
      absent: data.filter((d) => d.status === 'absent').length,
      leave: data.filter((d) => d.status === 'leave').length,
      late: data.filter((d) => d.status === 'late').length,
      unmarked: data.filter((d) => d.status === null).length,
    };
    res.json({ ok: true, data, meta: { date, summary } });
  } catch (err) { next(err); }
});

router.post('/employees/mark', requireRole(...MARK), validateBody(z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(z.object({
    employeeId: z.string().uuid(),
    status: z.enum(EMPLOYEE_STATUS),
    checkIn: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    checkOut: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    remarks: z.string().max(300).optional().nullable(),
  })).min(1).max(500),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    let saved = 0;
    for (const r of req.body.records) {
      const [emp] = await db.select({ id: employees.id }).from(employees)
        .where(and(eq(employees.id, r.employeeId), eq(employees.schoolId, schoolId))).limit(1);
      if (!emp) continue;
      const [existing] = await db.select({ id: employeeAttendance.id }).from(employeeAttendance)
        .where(and(eq(employeeAttendance.date, req.body.date), eq(employeeAttendance.employeeId, r.employeeId))).limit(1);
      if (existing) {
        await db.update(employeeAttendance).set({
          status: r.status, checkIn: r.checkIn ?? null, checkOut: r.checkOut ?? null,
          remarks: r.remarks ?? null, markedBy: req.auth!.id,
        }).where(eq(employeeAttendance.id, existing.id));
      } else {
        await db.insert(employeeAttendance).values({
          schoolId, date: req.body.date, employeeId: r.employeeId, status: r.status,
          checkIn: r.checkIn ?? null, checkOut: r.checkOut ?? null, remarks: r.remarks ?? null,
          method: 'manual', markedBy: req.auth!.id,
        });
      }
      saved++;
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'mark_attendance', entity: 'employee_attendance', detail: { date: req.body.date, count: saved }, ip: req.ip });
    res.json({ ok: true, data: { saved } });
  } catch (err) { next(err); }
});

router.get('/employees/monthly', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const month = String(req.query.month ?? new Date().toISOString().slice(0, 7));
    const rows = await db
      .select({
        employeeId: employees.id, nameEn: employees.nameEn, empCode: employees.empCode, designation: employees.designation,
        present: sql<number>`count(*) filter (where ${employeeAttendance.status} = 'present')::int`,
        absent: sql<number>`count(*) filter (where ${employeeAttendance.status} = 'absent')::int`,
        late: sql<number>`count(*) filter (where ${employeeAttendance.status} = 'late')::int`,
        leave: sql<number>`count(*) filter (where ${employeeAttendance.status} = 'leave')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(employeeAttendance)
      .innerJoin(employees, eq(employees.id, employeeAttendance.employeeId))
      .where(and(
        eq(employeeAttendance.schoolId, schoolId),
        sql`${employeeAttendance.date} >= ${month + '-01'}`,
        sql`${employeeAttendance.date} <= ${monthEndKey(month)}`,
      ))
      .groupBy(employees.id, employees.nameEn, employees.empCode, employees.designation)
      .orderBy(asc(employees.nameEn));
    res.json({ ok: true, data: rows, meta: { month } });
  } catch (err) { next(err); }
});

export default router;
