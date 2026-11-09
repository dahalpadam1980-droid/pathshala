import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { z } from 'zod';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import {
  students, classes, sections, academicYears, enrollments, studentDocuments,
  admissionApplications, promotions, users, studentSubjects, classSubjects,
} from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { parseSpreadsheet, toCsv, toXlsx, type ExportColumn } from '../../lib/excel.js';
import { config } from '../../config.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const READ = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'] as const;
const WRITE = ['super_admin', 'school_admin', 'office'] as const;

const studentSchema = z.object({
  admissionNo: z.string().min(1).max(40).optional(),
  studentCode: z.string().max(40).optional().nullable(),
  nameEn: z.string().min(1).max(150),
  nameNe: z.string().max(150).optional().nullable(),
  dobBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'BS date must be YYYY-MM-DD').optional().nullable(),
  dobAd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'AD date must be YYYY-MM-DD').optional().nullable(),
  gender: z.enum(['male', 'female', 'other']).default('other'),
  bloodGroup: z.string().max(5).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().max(300).optional().nullable(),
  municipality: z.string().max(120).optional().nullable(),
  ward: z.number().int().min(0).max(35).optional().nullable(),
  district: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  fatherName: z.string().max(150).optional().nullable(),
  fatherPhone: z.string().max(20).optional().nullable(),
  fatherOccupation: z.string().max(120).optional().nullable(),
  motherName: z.string().max(150).optional().nullable(),
  motherPhone: z.string().max(20).optional().nullable(),
  motherOccupation: z.string().max(120).optional().nullable(),
  guardianName: z.string().max(150).optional().nullable(),
  guardianRelation: z.string().max(60).optional().nullable(),
  guardianPhone: z.string().max(20).optional().nullable(),
  prevSchool: z.string().max(200).optional().nullable(),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  academicYearId: z.string().uuid().optional().nullable(),
  classId: z.string().uuid().optional().nullable(),
  sectionId: z.string().uuid().optional().nullable(),
  rollNo: z.number().int().min(0).max(999).optional().nullable(),
  house: z.string().max(60).optional().nullable(),
  photoUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(['active', 'transferred', 'withdrawn', 'alumni', 'suspended']).default('active'),
  /** Optional subjects the student chose (validated against the class's optional count). */
  subjectIds: z.array(z.string().uuid()).max(20).optional(),
});

/** Enriched list with class/section names + filters. */
router.get('/', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));
    const q = (req.query.q as string | undefined)?.trim();

    const filters: any[] = [eq(students.schoolId, schoolId)];
    for (const key of ['classId', 'sectionId', 'status', 'gender', 'academicYearId'] as const) {
      const v = req.query[key];
      if (v) filters.push(eq(students[key], String(v)));
    }
    if (q) {
      filters.push(or(
        like(students.nameEn, `%${q}%`),
        like(students.nameNe ?? '', `%${q}%`),
        like(students.admissionNo, `%${q}%`),
        like(students.fatherName ?? '', `%${q}%`),
        like(students.phone ?? '', `%${q}%`),
      )!);
    }
    const where = and(...filters);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(students).where(where);

    const rows = await db
      .select({
        id: students.id, admissionNo: students.admissionNo, nameEn: students.nameEn, nameNe: students.nameNe,
        gender: students.gender, dobAd: students.dobAd, dobBs: students.dobBs, phone: students.phone,
        fatherName: students.fatherName, photoUrl: students.photoUrl, status: students.status,
        classId: students.classId, sectionId: students.sectionId, rollNo: students.rollNo,
        admissionDate: students.admissionDate, house: students.house, userId: students.userId,
        className: classes.name, sectionName: sections.name,
        // Chosen optional subjects (for the edit form's subject picker)
        subjectIds: sql<string[]>`coalesce((
          select array_agg(${studentSubjects.subjectId})
          from ${studentSubjects} where ${studentSubjects.studentId} = ${students.id}
        ), '{}')`,
      })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(where)
      .orderBy(asc(students.rollNo), asc(students.nameEn))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // summary counts
    const [summary] = await db.select({
      total: sql<number>`count(*)::int`,
      male: sql<number>`count(*) filter (where ${students.gender} = 'male')::int`,
      female: sql<number>`count(*) filter (where ${students.gender} = 'female')::int`,
      active: sql<number>`count(*) filter (where ${students.status} = 'active')::int`,
    }).from(students).where(eq(students.schoolId, schoolId));

    res.json({ ok: true, data: rows, meta: { page, pageSize, total: count, pages: Math.max(1, Math.ceil(count / pageSize)), summary } });
  } catch (err) { next(err); }
});

router.get('/template', requireRole(...WRITE), async (_req, res, next) => {
  try {
    const { templateXlsx } = await import('../../lib/excel.js');
    const cols: ExportColumn[] = [
      { key: 'nameEn', header: 'Name (English)' },
      { key: 'nameNe', header: 'Name (Nepali)' },
      { key: 'admissionNo', header: 'Admission No' },
      { key: 'gender', header: 'Gender (male/female/other)' },
      { key: 'dobAd', header: 'DOB AD (YYYY-MM-DD)' },
      { key: 'dobBs', header: 'DOB BS (YYYY-MM-DD)' },
      { key: 'className', header: 'Class (e.g. 5)' },
      { key: 'sectionName', header: 'Section (e.g. A)' },
      { key: 'rollNo', header: 'Roll No' },
      { key: 'fatherName', header: 'Father Name' },
      { key: 'motherName', header: 'Mother Name' },
      { key: 'guardianPhone', header: 'Guardian Phone' },
      { key: 'address', header: 'Address' },
      { key: 'municipality', header: 'Municipality' },
      { key: 'ward', header: 'Ward' },
      { key: 'district', header: 'District' },
    ];
    const buf = await templateXlsx(cols, {
      nameEn: 'Ram Bahadur Thapa', nameNe: 'रामबहादुर थापा', admissionNo: 'ADM-0001',
      gender: 'male', dobAd: '2015-05-12', dobBs: '2072-02-30', className: '5',
      sectionName: 'A', rollNo: 12, fatherName: 'Hari Thapa', motherName: 'Sita Thapa',
      guardianPhone: '9800000000', address: 'Ward 5, Basundhara', municipality: 'Kathmandu',
      ward: 5, district: 'Kathmandu',
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.xlsx"');
    res.send(buf);
  } catch (err) { next(err); }
});

router.get('/export', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const rows = await db
      .select({
        admissionNo: students.admissionNo, nameEn: students.nameEn, nameNe: students.nameNe,
        gender: students.gender, dobAd: students.dobAd, dobBs: students.dobBs, status: students.status,
        className: classes.name, sectionName: sections.name, rollNo: students.rollNo,
        fatherName: students.fatherName, motherName: students.motherName, guardianPhone: students.guardianPhone,
        phone: students.phone, address: students.address, municipality: students.municipality,
        ward: students.ward, district: students.district, admissionDate: students.admissionDate,
      })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(students.schoolId, schoolId))
      .orderBy(asc(students.nameEn));

    const cols: ExportColumn[] = [
      { key: 'admissionNo', header: 'Admission No' },
      { key: 'nameEn', header: 'Name (English)' },
      { key: 'nameNe', header: 'Name (Nepali)' },
      { key: 'className', header: 'Class' },
      { key: 'sectionName', header: 'Section' },
      { key: 'rollNo', header: 'Roll No' },
      { key: 'gender', header: 'Gender' },
      { key: 'dobAd', header: 'DOB (AD)' },
      { key: 'dobBs', header: 'DOB (BS)' },
      { key: 'status', header: 'Status' },
      { key: 'fatherName', header: 'Father' },
      { key: 'motherName', header: 'Mother' },
      { key: 'guardianPhone', header: 'Guardian Phone' },
      { key: 'phone', header: 'Phone' },
      { key: 'address', header: 'Address' },
      { key: 'municipality', header: 'Municipality' },
      { key: 'ward', header: 'Ward' },
      { key: 'district', header: 'District' },
      { key: 'admissionDate', header: 'Admission Date' },
    ];

    if (req.query.format === 'xlsx') {
      const buf = await toXlsx(rows, cols, 'Students');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="students.xlsx"');
      return res.send(buf);
    }
    const csv = toCsv(rows, cols);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

/**
 * Self-service records: a student sees their own profile, a parent sees their children.
 * Parents are matched by name/phone against the father/mother/guardian columns.
 */
router.get('/my', requireRole('student', 'parent'), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [me] = await db
      .select({ nameEn: users.nameEn, nameNe: users.nameNe, phone: users.phone, email: users.email })
      .from(users)
      .where(eq(users.id, req.auth!.id))
      .limit(1);

    const conditions =
      req.auth!.role === 'student'
        ? [eq(students.schoolId, schoolId), eq(students.userId, req.auth!.id)]
        : [
            eq(students.schoolId, schoolId),
            eq(students.status, 'active'),
            or(
              me?.nameEn ? eq(students.fatherName, me.nameEn) : sql`false`,
              me?.nameEn ? eq(students.motherName, me.nameEn) : sql`false`,
              me?.nameEn ? eq(students.guardianName, me.nameEn) : sql`false`,
              me?.phone ? eq(students.fatherPhone, me.phone) : sql`false`,
              me?.phone ? eq(students.motherPhone, me.phone) : sql`false`,
              me?.phone ? eq(students.guardianPhone, me.phone) : sql`false`,
            )!,
          ];

    const rows = await db
      .select({
        id: students.id, admissionNo: students.admissionNo, nameEn: students.nameEn, nameNe: students.nameNe,
        rollNo: students.rollNo, gender: students.gender, dobBs: students.dobBs, dobAd: students.dobAd,
        classId: students.classId, sectionId: students.sectionId, status: students.status,
        photoUrl: students.photoUrl, fatherName: students.fatherName, motherName: students.motherName,
        address: students.address, municipality: students.municipality, ward: students.ward,
        district: students.district, province: students.province, admissionDate: students.admissionDate,
        className: classes.name, sectionName: sections.name,
      })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(and(...conditions))
      .orderBy(asc(students.rollNo));

    res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
});

/** Detail with documents + enrollment history. */
router.get('/:id', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [student] = await db
      .select({
        s: students,
        className: classes.name,
        sectionName: sections.name,
      })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(and(eq(students.id, req.params.id), eq(students.schoolId, schoolId)))
      .limit(1);
    if (!student) throw ApiError.notFound('Student not found');

    const [docs, history, yearRow, choices] = await Promise.all([
      db.select().from(studentDocuments).where(eq(studentDocuments.studentId, req.params.id)),
      db
        .select({
          id: enrollments.id, status: enrollments.status, rollNo: enrollments.rollNo,
          className: classes.name, sectionName: sections.name, yearName: academicYears.name,
        })
        .from(enrollments)
        .leftJoin(classes, eq(classes.id, enrollments.classId))
        .leftJoin(sections, eq(sections.id, enrollments.sectionId))
        .leftJoin(academicYears, eq(academicYears.id, enrollments.academicYearId))
        .where(eq(enrollments.studentId, req.params.id)),
      db.select({ id: academicYears.id }).from(academicYears)
        .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true))).limit(1),
      db.select({ subjectId: studentSubjects.subjectId }).from(studentSubjects)
        .where(eq(studentSubjects.studentId, req.params.id)),
    ]);

    res.json({
      ok: true,
      data: {
        ...student.s, className: student.className, sectionName: student.sectionName,
        documents: docs, history, currentYearId: yearRow[0]?.id ?? null,
        subjectIds: choices.map((c) => c.subjectId),
      },
    });
  } catch (err) { next(err); }
});

async function nextAdmissionNo(schoolId: string): Promise<string> {
  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(students).where(eq(students.schoolId, schoolId));
  let n = count + 1;
  for (let i = 0; i < 20; i++) {
    const candidate = `ADM-${String(n).padStart(4, '0')}`;
    const [dupe] = await db.select({ id: students.id }).from(students)
      .where(and(eq(students.schoolId, schoolId), eq(students.admissionNo, candidate))).limit(1);
    if (!dupe) return candidate;
    n++;
  }
  return `ADM-${Date.now()}`;
}

async function nextRollNo(schoolId: string, sectionId: string | null | undefined): Promise<number | null> {
  if (!sectionId) return null;
  const db = await getDb();
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${students.rollNo}), 0)::int` })
    .from(students).where(and(eq(students.schoolId, schoolId), eq(students.sectionId, sectionId)));
  return (max ?? 0) + 1;
}

/**
 * Validate a student's chosen optional subjects against the class.
 * The class must have an optionalCount (2 for classes 9/10, 3 for 11/12 by default)
 * and every choice must come from that class's optional pool (compulsory unchecked).
 * Returns the de-duplicated ids; throws ApiError.badRequest on any mismatch.
 */
async function validateSubjectChoices(
  schoolId: string,
  classId: string | null | undefined,
  subjectIds: string[],
): Promise<string[]> {
  const db = await getDb();
  const unique = [...new Set(subjectIds)];

  if (unique.length !== subjectIds.length) throw ApiError.badRequest('Duplicate subject selection');
  if (!unique.length) return [];
  if (!classId) throw ApiError.badRequest('Assign a class before choosing optional subjects');

  const [cls] = await db.select().from(classes)
    .where(and(eq(classes.id, classId), eq(classes.schoolId, schoolId))).limit(1);
  if (!cls) throw ApiError.badRequest('Class not found');
  const optionalCount = cls.optionalCount ?? 0;
  if (optionalCount === 0) {
    throw ApiError.badRequest('This class has no optional subjects configured — set the optional-subject count on the class first');
  }

  const poolRows = await db.select({ subjectId: classSubjects.subjectId }).from(classSubjects)
    .where(and(
      eq(classSubjects.schoolId, schoolId),
      eq(classSubjects.classId, classId),
      eq(classSubjects.isCompulsory, false),
    ));
  const pool = new Set(poolRows.map((r) => r.subjectId));
  if (!pool.size) throw ApiError.badRequest('No optional subjects are mapped to this class yet');

  const invalid = unique.filter((id) => !pool.has(id));
  if (invalid.length) throw ApiError.badRequest('All chosen subjects must be optional subjects of this class');

  const required = Math.min(optionalCount, pool.size);
  if (unique.length !== required) {
    throw ApiError.badRequest(`Choose exactly ${required} optional subject${required === 1 ? '' : 's'} for this class`);
  }
  return unique;
}

/** Replace the stored choices for a student (validated). */
async function saveSubjectChoices(
  schoolId: string,
  studentId: string,
  classId: string | null | undefined,
  subjectIds: string[],
): Promise<void> {
  const unique = await validateSubjectChoices(schoolId, classId, subjectIds);
  const db = await getDb();
  await db.delete(studentSubjects).where(eq(studentSubjects.studentId, studentId));
  if (!unique.length) return;
  await db.insert(studentSubjects)
    .values(unique.map((subjectId) => ({ schoolId, studentId, subjectId })))
    .onConflictDoNothing();
}

router.post('/', requireRole(...WRITE), validateBody(studentSchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const body: any = { ...req.body };
    const subjectIds: string[] | undefined = body.subjectIds;
    delete body.subjectIds; // not a students-table column — stored in student_subjects
    if (body.email === '') body.email = null;
    body.schoolId = schoolId;
    if (!body.admissionNo) body.admissionNo = await nextAdmissionNo(schoolId);
    if (!body.rollNo && body.sectionId) body.rollNo = await nextRollNo(schoolId, body.sectionId);
    if (!body.academicYearId) {
      const [year] = await db.select({ id: academicYears.id }).from(academicYears)
        .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true))).limit(1);
      body.academicYearId = year?.id ?? null;
    }

    const [dupe] = await db.select({ id: students.id }).from(students)
      .where(and(eq(students.schoolId, schoolId), eq(students.admissionNo, body.admissionNo))).limit(1);
    if (dupe) throw ApiError.conflict(`Admission number ${body.admissionNo} already exists`);

    // Validate optional-subject choices BEFORE inserting so a bad request changes nothing.
    const validatedChoices = subjectIds !== undefined
      ? await validateSubjectChoices(schoolId, body.classId, subjectIds)
      : undefined;

    const [row] = await db.insert(students).values(body).returning();

    if (body.classId && body.academicYearId) {
      await db.insert(enrollments).values({
        schoolId, studentId: row.id, academicYearId: body.academicYearId,
        classId: body.classId, sectionId: body.sectionId ?? null, rollNo: body.rollNo ?? null,
      }).onConflictDoNothing();
    }

    if (validatedChoices?.length) {
      await db.insert(studentSubjects)
        .values(validatedChoices.map((subjectId) => ({ schoolId, studentId: row.id, subjectId })))
        .onConflictDoNothing();
    }

    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'student', entityId: row.id, detail: { admissionNo: row.admissionNo, nameEn: row.nameEn }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(...WRITE), validateBody(studentSchema.partial()), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const body: any = { ...req.body, updatedAt: new Date() };
    const subjectIds: string[] | undefined = body.subjectIds;
    delete body.subjectIds; // stored in student_subjects, not on the students row
    if (body.email === '') body.email = null;
    delete body.schoolId; delete body.admissionNo; // immutable

    if (subjectIds !== undefined) {
      // Validate & persist choices first (against the new class when it changes),
      // so a validation error leaves the student untouched.
      let targetClassId = body.classId;
      if (targetClassId === undefined) {
        const [cur] = await db.select({ classId: students.classId }).from(students)
          .where(and(eq(students.id, req.params.id), eq(students.schoolId, schoolId))).limit(1);
        if (!cur) throw ApiError.notFound('Student not found');
        targetClassId = cur.classId;
      }
      await saveSubjectChoices(schoolId, req.params.id, targetClassId, subjectIds);
    }

    const [row] = await db.update(students).set(body)
      .where(and(eq(students.id, req.params.id), eq(students.schoolId, schoolId))).returning();
    if (!row) throw ApiError.notFound('Student not found');
    await audit(db, { schoolId, userId: req.auth!.id, action: 'update', entity: 'student', entityId: row.id, detail: body, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [existing] = await db.select().from(students)
      .where(and(eq(students.id, req.params.id), eq(students.schoolId, schoolId))).limit(1);
    if (!existing) throw ApiError.notFound('Student not found');
    await db.update(students).set({ userId: null }).where(eq(students.id, existing.id));
    await db.delete(studentDocuments).where(eq(studentDocuments.studentId, existing.id));
    await db.delete(studentSubjects).where(eq(studentSubjects.studentId, existing.id));
    await db.delete(enrollments).where(eq(enrollments.studentId, existing.id));
    await db.delete(students).where(eq(students.id, existing.id));
    await audit(db, { schoolId, userId: req.auth!.id, action: 'delete', entity: 'student', entityId: existing.id, detail: { admissionNo: existing.admissionNo }, ip: req.ip });
    res.json({ ok: true, data: { id: existing.id, deleted: true } });
  } catch (err) { next(err); }
});

// ---------------- Documents ----------------
router.post('/:id/documents', requireRole(...WRITE), validateBody(z.object({
  type: z.enum(['birth_certificate', 'citizenship', 'previous_report', 'photo', 'other']),
  title: z.string().min(1).max(200),
  fileUrl: z.string().min(1).max(500),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(studentDocuments).values({
      schoolId: req.auth!.schoolId!, studentId: req.params.id, ...req.body,
    }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/documents/:docId', requireRole(...WRITE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(studentDocuments)
      .where(and(eq(studentDocuments.id, req.params.docId), eq(studentDocuments.schoolId, req.auth!.schoolId!)))
      .returning();
    if (!row) throw ApiError.notFound('Document not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ---------------- Bulk import ----------------
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.resolve(config.uploadDir)),
    filename: (_req, file, cb) => cb(null, `import-${Date.now()}${path.extname(file.originalname) || '.xlsx'}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Only .xlsx, .xls and .csv files are allowed'));
  },
});

router.post('/import', requireRole(...WRITE), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw ApiError.badRequest('Upload a spreadsheet file as "file"');
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const rows = await parseSpreadsheet(req.file.path);

    const [classesRows, sectionRows, yearRow] = await Promise.all([
      db.select().from(classes).where(eq(classes.schoolId, schoolId)),
      db.select().from(sections).where(eq(sections.schoolId, schoolId)),
      db.select({ id: academicYears.id }).from(academicYears)
        .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true))).limit(1),
    ]);
    const classByName = new Map(classesRows.map((c) => [c.name.trim().toLowerCase(), c]));
    const sectionByName = new Map(sectionRows.map((s) => [`${s.classId}:${s.name.trim().toLowerCase()}`, s]));

    let created = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = i + 2;
      try {
        const nameEn = (r['Name (English)'] ?? r['nameEn'] ?? '').trim();
        if (!nameEn) { errors.push({ row: rowNo, message: 'Name (English) is required' }); continue; }

        const clsName = (r['Class'] ?? r['className'] ?? '').trim().toLowerCase();
        const secName = (r['Section'] ?? r['sectionName'] ?? '').trim().toLowerCase();
        const cls = clsName ? classByName.get(clsName) : undefined;
        if (clsName && !cls) { errors.push({ row: rowNo, message: `Class "${r['Class']}" not found` }); continue; }
        const sec = cls && secName ? sectionByName.get(`${cls.id}:${secName}`) : undefined;

        let admissionNo = (r['Admission No'] ?? r['admissionNo'] ?? '').trim();
        if (!admissionNo) admissionNo = await nextAdmissionNo(schoolId);

        const [dupe] = await db.select({ id: students.id }).from(students)
          .where(and(eq(students.schoolId, schoolId), eq(students.admissionNo, admissionNo))).limit(1);
        if (dupe) { errors.push({ row: rowNo, message: `Admission no ${admissionNo} already exists` }); continue; }

        const rollRaw = Number(r['Roll No'] ?? r['rollNo'] ?? 0);
        const wardRaw = Number(r['Ward'] ?? r['ward'] ?? 0);
        const genderRaw = (r['Gender'] ?? r['gender'] ?? 'other').toLowerCase();
        const statusRaw = (r['Status'] ?? '').toLowerCase();

        const [student] = await db.insert(students).values({
          schoolId,
          admissionNo,
          nameEn,
          nameNe: (r['Name (Nepali)'] ?? r['nameNe'] ?? '').trim() || null,
          gender: ['male', 'female'].includes(genderRaw) ? (genderRaw as any) : 'other',
          dobAd: (r['DOB AD (YYYY-MM-DD)'] ?? r['dobAd'] ?? '').trim() || null,
          dobBs: (r['DOB BS (YYYY-MM-DD)'] ?? r['dobBs'] ?? '').trim() || null,
          fatherName: (r['Father Name'] ?? r['fatherName'] ?? '').trim() || null,
          motherName: (r['Mother Name'] ?? r['motherName'] ?? '').trim() || null,
          guardianPhone: (r['Guardian Phone'] ?? r['guardianPhone'] ?? '').trim() || null,
          phone: (r['Phone'] ?? '').trim() || null,
          address: (r['Address'] ?? r['address'] ?? '').trim() || null,
          municipality: (r['Municipality'] ?? r['municipality'] ?? '').trim() || null,
          ward: Number.isFinite(wardRaw) && wardRaw > 0 ? wardRaw : null,
          district: (r['District'] ?? r['district'] ?? '').trim() || null,
          classId: cls?.id ?? null,
          sectionId: sec?.id ?? null,
          rollNo: Number.isFinite(rollRaw) && rollRaw > 0 ? rollRaw : null,
          academicYearId: yearRow[0]?.id ?? null,
          status: statusRaw === 'transferred' || statusRaw === 'withdrawn' || statusRaw === 'alumni' ? statusRaw : 'active',
          admissionDate: new Date().toISOString().slice(0, 10),
        }).returning();

        if (cls && yearRow[0]) {
          await db.insert(enrollments).values({
            schoolId, studentId: student.id, academicYearId: yearRow[0].id,
            classId: cls.id, sectionId: sec?.id ?? null, rollNo: student.rollNo,
          }).onConflictDoNothing();
        }
        created++;
      } catch (err) {
        errors.push({ row: rowNo, message: (err as Error).message.slice(0, 200) });
      }
    }

    await audit(db, { schoolId, userId: req.auth!.id, action: 'import', entity: 'student', detail: { created, errors: errors.length, file: req.file.originalname }, ip: req.ip });
    res.json({ ok: true, data: { created, failed: errors.length, errors: errors.slice(0, 50), total: rows.length } });
  } catch (err) { next(err); }
});

// ---------------- Promotion ----------------
router.post('/promote', requireRole(...WRITE), validateBody(z.object({
  fromClassId: z.string().uuid(),
  toClassId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1),
  toSectionId: z.string().uuid().optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const { fromClassId, toClassId, studentIds, toSectionId } = req.body;

    const [year] = await db.select({ id: academicYears.id }).from(academicYears)
      .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true))).limit(1);

    let promoted = 0;
    for (const sid of studentIds) {
      const [st] = await db.select().from(students)
        .where(and(eq(students.id, sid), eq(students.schoolId, schoolId), eq(students.classId, fromClassId))).limit(1);
      if (!st) continue;
      const roll = await nextRollNo(schoolId, toSectionId ?? st.sectionId);
      await db.update(students).set({ classId: toClassId, sectionId: toSectionId ?? null, rollNo: roll, updatedAt: new Date() }).where(eq(students.id, sid));
      if (year) {
        await db.update(enrollments).set({ status: 'promoted' })
          .where(and(eq(enrollments.studentId, sid), eq(enrollments.academicYearId, year.id)));
      }
      promoted++;
    }
    const [promo] = await db.insert(promotions).values({
      schoolId, academicYearId: year?.id ?? studentIds[0], fromClassId, toClassId,
      studentIds, result: { promoted }, createdBy: req.auth!.id,
    }).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'promote', entity: 'student', entityId: promo.id, detail: { fromClassId, toClassId, count: promoted }, ip: req.ip });
    res.json({ ok: true, data: { promoted, promotionId: promo.id } });
  } catch (err) { next(err); }
});

// ---------------- Online admission applications ----------------
const applicationSchema = z.object({
  nameEn: z.string().min(1).max(150),
  nameNe: z.string().max(150).optional().nullable(),
  classApplied: z.string().min(1).max(60),
  dobAd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dobBs: z.string().max(20).optional().nullable(),
  gender: z.enum(['male', 'female', 'other']).optional().nullable(),
  fatherName: z.string().max(150).optional().nullable(),
  motherName: z.string().max(150).optional().nullable(),
  guardianPhone: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  prevSchool: z.string().max(200).optional().nullable(),
});

/** Public: anyone can submit an application for a school. */
router.post('/applications/public/:code', validateBody(applicationSchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const { schools } = await import('../../db/schema/index.js');
    const [school] = await db.select({ id: schools.id }).from(schools).where(eq(schools.code, req.params.code)).limit(1);
    if (!school) throw ApiError.notFound('School not found');
    const [row] = await db.insert(admissionApplications).values({ schoolId: school.id, ...req.body }).returning();
    res.status(201).json({ ok: true, data: { id: row.id, status: row.status } });
  } catch (err) { next(err); }
});

router.get('/applications', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const filters: any[] = [eq(admissionApplications.schoolId, req.auth!.schoolId!)];
    if (req.query.status) filters.push(eq(admissionApplications.status, String(req.query.status)));
    const rows = await db.select().from(admissionApplications).where(and(...filters)).orderBy(desc(admissionApplications.submittedAt)).limit(200);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/applications/:id/review', requireRole(...WRITE), validateBody(z.object({
  decision: z.enum(['approved', 'rejected', 'waitlist']),
  rejectionReason: z.string().max(500).optional().nullable(),
  // when approving, optionally enroll immediately
  classId: z.string().uuid().optional().nullable(),
  sectionId: z.string().uuid().optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [app] = await db.select().from(admissionApplications)
      .where(and(eq(admissionApplications.id, req.params.id), eq(admissionApplications.schoolId, schoolId))).limit(1);
    if (!app) throw ApiError.notFound('Application not found');
    if (app.status !== 'pending') throw ApiError.badRequest(`Application already ${app.status}`);

    let studentId: string | null = null;
    if (req.body.decision === 'approved') {
      const admissionNo = await nextAdmissionNo(schoolId);
      const [year] = await db.select({ id: academicYears.id }).from(academicYears)
        .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true))).limit(1);
      const roll = req.body.sectionId ? await nextRollNo(schoolId, req.body.sectionId) : null;
      const [student] = await db.insert(students).values({
        schoolId, admissionNo, nameEn: app.nameEn, nameNe: app.nameNe,
        dobAd: app.dobAd, dobBs: app.dobBs, gender: app.gender ?? 'other',
        fatherName: app.fatherName, motherName: app.motherName,
        guardianPhone: app.guardianPhone, address: app.address, prevSchool: app.prevSchool,
        classId: req.body.classId ?? null, sectionId: req.body.sectionId ?? null,
        rollNo: roll, academicYearId: year?.id ?? null,
        admissionDate: new Date().toISOString().slice(0, 10),
        status: 'active',
      }).returning();
      studentId = student.id;
      if (req.body.classId && year) {
        await db.insert(enrollments).values({
          schoolId, studentId, academicYearId: year.id,
          classId: req.body.classId, sectionId: req.body.sectionId ?? null, rollNo: roll,
        }).onConflictDoNothing();
      }
    }

    const [row] = await db.update(admissionApplications).set({
      status: req.body.decision,
      rejectionReason: req.body.rejectionReason ?? null,
      studentId, reviewedBy: req.auth!.id, reviewedAt: new Date(),
    }).where(eq(admissionApplications.id, app.id)).returning();

    await audit(db, { schoolId, userId: req.auth!.id, action: `application_${req.body.decision}`, entity: 'admission_application', entityId: app.id, detail: { studentId }, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

export default router;
