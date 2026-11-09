import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { certificateTemplates, issuedCertificates, students, employees, schools, classes, sections, academicYears } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const ALL = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'] as const;
const MANAGE = ['super_admin', 'school_admin', 'office'] as const;

export const CERT_TYPES: Record<string, { en: string; ne: string; body: string }> = {
  character: {
    en: 'CHARACTER CERTIFICATE',
    ne: 'चरित्र प्रमाणपत्र',
    body: `This is to certify that <strong>{{name}}</strong>, son/daughter of <strong>{{father}}</strong> and <strong>{{mother}}</strong>, bearing admission number <strong>{{admissionNo}}</strong>, was a student of this school in Class <strong>{{className}}</strong> (Section {{sectionName}}) during the academic year <strong>{{year}}</strong>.
The student bears good moral character and has been found disciplined and sincere during the entire period of study.<br/><br/>This certificate is issued on request for official purposes.`,
  },
  transfer: {
    en: 'TRANSFER CERTIFICATE',
    ne: 'स्थानान्तरण प्रमाणपत्र',
    body: `This is to certify that <strong>{{name}}</strong> (Admission No. <strong>{{admissionNo}}</strong>), son/daughter of <strong>{{father}}</strong> and <strong>{{mother}}</strong>, was a student of this school in Class <strong>{{className}}</strong>, Section <strong>{{sectionName}}</strong>.
Date of admission: <strong>{{admissionDate}}</strong>.<br/>The student has cleared all dues up to the date of issue and all school property has been returned. No objection is raised for the student's transfer to another school.`,
  },
  bonafide: {
    en: 'BONAFIDE CERTIFICATE',
    ne: 'बोनाफाइड प्रमाणपत्र',
    body: `This is to certify that <strong>{{name}}</strong>, admission number <strong>{{admissionNo}}</strong>, is a bonafide student of this school, presently reading in Class <strong>{{className}}</strong>, Section <strong>{{sectionName}}</strong>, Roll No. <strong>{{rollNo}}</strong>.
This certificate is issued for the purpose of <strong>{{purpose}}</strong>.`,
  },
  study: {
    en: 'CERTIFICATE OF STUDY',
    ne: 'अध्ययन प्रमाणपत्र',
    body: `<strong>{{name}}</strong> (Admission No. <strong>{{admissionNo}}</strong>) has studied in this school from <strong>{{admissionDate}}</strong> up to the present date in Class <strong>{{className}}</strong>, Section <strong>{{sectionName}}</strong>.`,
  },
  admission: {
    en: 'ADMISSION FORM',
    ne: 'भर्ना फारम',
    body: `Student Name (English): <strong>{{name}}</strong><br/>Student Name (Nepali): <strong>{{nameNe}}</strong><br/>Admission No: <strong>{{admissionNo}}</strong><br/>Date of Birth (AD): <strong>{{dobAd}}</strong> &nbsp; (BS): <strong>{{dobBs}}</strong><br/>Gender: <strong>{{gender}}</strong><br/>Father: <strong>{{father}}</strong> &nbsp; Phone: <strong>{{fatherPhone}}</strong><br/>Mother: <strong>{{mother}}</strong><br/>Guardian: <strong>{{guardian}}</strong> ({{guardianRelation}})<br/>Address: <strong>{{address}}</strong>, Ward {{ward}}, {{municipality}}, {{district}}<br/>Previous School: <strong>{{prevSchool}}</strong><br/>Admission Date: <strong>{{admissionDate}}</strong><br/>Class: <strong>{{className}}</strong> - {{sectionName}} (Roll {{rollNo}})`,
  },
  appointment: {
    en: 'APPOINTMENT LETTER',
    ne: 'नियुक्ति पत्र',
    body: `<strong>{{name}}</strong> (Employee Code: <strong>{{empCode}}</strong>) is hereby appointed as <strong>{{designation}}</strong> in this school with effect from <strong>{{appointmentDate}}</strong> under the <strong>{{appointmentType}}</strong> appointment category.
Qualification: <strong>{{qualification}}</strong>.<br/>Subject specialization: <strong>{{subjectSpecialization}}</strong>.<br/>This appointment is subject to the rules and regulations of the school management committee.`,
  },
  experience: {
    en: 'EXPERIENCE CERTIFICATE',
    ne: 'अनुभव प्रमाणपत्र',
    body: `This is to certify that <strong>{{name}}</strong> (Employee Code: <strong>{{empCode}}</strong>) has worked in this school as <strong>{{designation}}</strong> from <strong>{{appointmentDate}}</strong> to <strong>{{endDate}}</strong>.
During the period of service, the employee's conduct and performance were found satisfactory.`,
  },
  salary: {
    en: 'SALARY CERTIFICATE',
    ne: 'तलब प्रमाणपत्र',
    body: `<strong>{{name}}</strong> (Employee Code: <strong>{{empCode}}</strong>) is serving this school as <strong>{{designation}}</strong> and receives a gross monthly salary of <strong>NPR {{salary}}</strong> as per the school's approved salary structure.`,
  },
  recommendation: {
    en: 'LETTER OF RECOMMENDATION',
    ne: 'सिफारिस पत्र',
    body: `<strong>{{name}}</strong> has been associated with this school and we found the person honest, hardworking and dedicated. We recommend <strong>{{name}}</strong> for any appropriate assignment or opportunity.`,
  },
  fee_receipt: {
    en: 'FEE RECEIPT',
    ne: 'शुल्क रसिद',
    body: `Receipt No: <strong>{{receiptNo}}</strong><br/>Received from <strong>{{name}}</strong> ({{admissionNo}}), Class {{className}}:<br/>Amount: <strong>NPR {{amount}}</strong> ({{method}})<br/>For: <strong>{{purpose}}</strong><br/>Date: <strong>{{date}}</strong>`,
  },
  official_letter: {
    en: 'OFFICIAL LETTER',
    ne: 'आधिकारिक पत्र',
    body: `{{body}}`,
  },
};

router.get('/types', requireRole(...ALL), async (_req, res) => {
  res.json({
    ok: true,
    data: Object.entries(CERT_TYPES).map(([type, v]) => ({ type, en: v.en, ne: v.ne })),
  });
});

// ================= Templates =================
router.get('/templates', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(certificateTemplates)
      .where(eq(certificateTemplates.schoolId, req.auth!.schoolId!))
      .orderBy(certificateTemplates.type, certificateTemplates.name);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

/** Create a default template for a type if none exists (lazy seeding, editable afterwards). */
async function ensureTemplate(schoolId: string, type: string) {
  const db = await getDb();
  const [existing] = await db.select().from(certificateTemplates)
    .where(and(eq(certificateTemplates.schoolId, schoolId), eq(certificateTemplates.type, type))).limit(1);
  if (existing) return existing;
  const meta = CERT_TYPES[type];
  if (!meta) throw ApiError.badRequest(`Unknown certificate type: ${type}`);
  const [row] = await db.insert(certificateTemplates).values({
    schoolId, type, name: meta.en, locale: 'both', bodyHtml: meta.body, isDefault: true,
  }).returning();
  return row;
}

router.post('/templates', requireRole(...MANAGE), validateBody(z.object({
  type: z.enum(Object.keys(CERT_TYPES) as [string, ...string[]]),
  name: z.string().min(1).max(200),
  locale: z.enum(['en', 'ne', 'both']).default('both'),
  bodyHtml: z.string().min(1).max(50000),
  signatureFields: z.array(z.object({ label: z.string().max(120), role: z.string().max(60) })).optional(),
  useSchoolLogo: z.boolean().optional(),
  useSchoolStamp: z.boolean().optional(),
  pageSize: z.enum(['a4', 'a4_landscape', 'legal']).optional(),
  isDefault: z.boolean().default(false),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    if (req.body.isDefault) {
      await db.update(certificateTemplates).set({ isDefault: false })
        .where(and(eq(certificateTemplates.schoolId, schoolId), eq(certificateTemplates.type, req.body.type)));
    }
    const [row] = await db.insert(certificateTemplates).values({ ...req.body, schoolId }).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'certificate_template', entityId: row.id, detail: { type: row.type }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/templates/:id', requireRole(...MANAGE), validateBody(z.object({
  name: z.string().min(1).max(200).optional(),
  locale: z.enum(['en', 'ne', 'both']).optional(),
  bodyHtml: z.string().min(1).max(50000).optional(),
  signatureFields: z.array(z.object({ label: z.string().max(120), role: z.string().max(60) })).optional(),
  useSchoolLogo: z.boolean().optional(),
  useSchoolStamp: z.boolean().optional(),
  pageSize: z.enum(['a4', 'a4_landscape', 'legal']).optional(),
  isDefault: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    if (req.body.isDefault) {
      const [existing] = await db.select().from(certificateTemplates).where(eq(certificateTemplates.id, req.params.id)).limit(1);
      if (existing) await db.update(certificateTemplates).set({ isDefault: false })
        .where(and(eq(certificateTemplates.schoolId, schoolId), eq(certificateTemplates.type, existing.type)));
    }
    const [row] = await db.update(certificateTemplates).set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(certificateTemplates.id, req.params.id), eq(certificateTemplates.schoolId, schoolId))).returning();
    if (!row) throw ApiError.notFound('Template not found');
    await audit(db, { schoolId, userId: req.auth!.id, action: 'update', entity: 'certificate_template', entityId: row.id, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/templates/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(certificateTemplates)
      .where(and(eq(certificateTemplates.id, req.params.id), eq(certificateTemplates.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Template not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Issue certificates =================
async function collectPlaceholders(schoolId: string, opts: { studentId?: string; employeeId?: string; extra?: Record<string, unknown> }): Promise<Record<string, string>> {
  const db = await getDb();
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  const out: Record<string, string> = {
    school: school?.nameEn ?? '', schoolNe: school?.nameNe ?? '',
    principal: school?.principalName ?? '', address: school?.address ?? '',
    municipality: school?.municipality ?? '', district: school?.district ?? '',
    date: new Date().toISOString().slice(0, 10),
    ...opts.extra,
  };
  if (opts.studentId) {
    const [st] = await db.select({ s: students, className: classes.name })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(eq(students.id, opts.studentId)).limit(1);
    if (st) {
      const s = st.s;
      const [sec] = await db.select().from(sections)
        .where(eq(sections.id, s.sectionId ?? '')).limit(1);
      const [year] = await db.select().from(academicYears)
        .where(eq(academicYears.id, s.academicYearId ?? '')).limit(1);
      Object.assign(out, {
        name: s.nameEn, nameNe: s.nameNe ?? '', admissionNo: s.admissionNo,
        dobAd: s.dobAd ?? '', dobBs: s.dobBs ?? '', gender: s.gender ?? '',
        father: s.fatherName ?? '', fatherPhone: s.fatherPhone ?? '',
        mother: s.motherName ?? '', guardian: s.guardianName ?? '', guardianRelation: s.guardianRelation ?? '',
        address: s.address ?? '', ward: String(s.ward ?? ''), district: s.district ?? '',
        prevSchool: s.prevSchool ?? '', admissionDate: s.admissionDate ?? '',
        className: st.className ?? '', sectionName: sec?.name ?? '', rollNo: String(s.rollNo ?? ''),
        year: year?.name ?? '',
      });
    }
  }
  if (opts.employeeId) {
    const [emp] = await db.select().from(employees).where(eq(employees.id, opts.employeeId)).limit(1);
    if (emp) {
      Object.assign(out, {
        name: emp.nameEn, nameNe: emp.nameNe ?? '', empCode: emp.empCode,
        designation: emp.designation ?? '', appointmentType: emp.appointmentType,
        appointmentDate: emp.appointmentDate ?? '', endDate: emp.endDate ?? '',
        qualification: (emp.qualification ?? []).map((q: any) => `${q.degree} (${q.board}, ${q.year})`).join(', '),
        subjectSpecialization: emp.subjectSpecialization ?? '',
      });
    }
  }
  return out;
}

function renderBody(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? `{{${key}}}`);
}

async function nextSerial(schoolId: string): Promise<string> {
  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(issuedCertificates).where(eq(issuedCertificates.schoolId, schoolId));
  return `CERT-${String(count + 1).padStart(5, '0')}`;
}

router.post('/issue', requireRole(...MANAGE), validateBody(z.object({
  type: z.enum(Object.keys(CERT_TYPES) as [string, ...string[]]),
  studentId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  extra: z.record(z.string(), z.string()).default({}),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const { type, studentId, employeeId, extra } = req.body;
    if (!studentId && !employeeId) throw ApiError.badRequest('Select a student or an employee');
    if (studentId) {
      const [st] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.id, studentId), eq(students.schoolId, schoolId))).limit(1);
      if (!st) throw ApiError.notFound('Student not found');
    }
    const template = await ensureTemplate(schoolId, type);
    const vars = await collectPlaceholders(schoolId, { studentId, employeeId, extra });
    const serialNo = await nextSerial(schoolId);
    const bodyHtml = renderBody(template.bodyHtml, vars);

    const [row] = await db.insert(issuedCertificates).values({
      schoolId, type, templateId: template.id, studentId: studentId ?? null,
      employeeId: employeeId ?? null, serialNo, data: vars, issuedBy: req.auth!.id,
    }).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'issue_certificate', entity: 'issued_certificate', entityId: row.id, detail: { type, serialNo, studentId }, ip: req.ip });
    res.status(201).json({ ok: true, data: { ...row, bodyHtml, template } });
  } catch (err) { next(err); }
});

router.get('/issued', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const filters: any[] = [eq(issuedCertificates.schoolId, req.auth!.schoolId!)];
    if (req.query.type) filters.push(eq(issuedCertificates.type, String(req.query.type)));
    if (req.query.studentId) filters.push(eq(issuedCertificates.studentId, String(req.query.studentId)));
    const rows = await db.select({
      id: issuedCertificates.id, type: issuedCertificates.type, serialNo: issuedCertificates.serialNo,
      issuedAt: issuedCertificates.issuedAt, studentId: issuedCertificates.studentId,
      employeeId: issuedCertificates.employeeId, data: issuedCertificates.data,
      studentName: students.nameEn, employeeName: employees.nameEn,
    }).from(issuedCertificates)
      .leftJoin(students, eq(students.id, issuedCertificates.studentId))
      .leftJoin(employees, eq(employees.id, issuedCertificates.employeeId))
      .where(and(...filters))
      .orderBy(desc(issuedCertificates.issuedAt)).limit(200);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

/** Render an issued certificate as printable HTML. */
router.get('/issued/:id/print', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const [cert] = await db.select().from(issuedCertificates)
      .where(and(eq(issuedCertificates.id, req.params.id), eq(issuedCertificates.schoolId, req.auth!.schoolId!))).limit(1);
    if (!cert) throw ApiError.notFound('Certificate not found');
    const [template] = cert.templateId
      ? await db.select().from(certificateTemplates).where(eq(certificateTemplates.id, cert.templateId)).limit(1)
      : [null];
    const [school] = await db.select().from(schools).where(eq(schools.id, cert.schoolId!)).limit(1);
    const bodyHtml = renderBody(template?.bodyHtml ?? '{{name}}', cert.data as Record<string, string>);
    res.json({ ok: true, data: { serialNo: cert.serialNo, type: cert.type, bodyHtml, template, school, data: cert.data } });
  } catch (err) { next(err); }
});

router.delete('/issued/:id', requireRole(...MANAGE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(issuedCertificates)
      .where(and(eq(issuedCertificates.id, req.params.id), eq(issuedCertificates.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Certificate not found');
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'revoke_certificate', entity: 'issued_certificate', entityId: row.id, ip: req.ip });
    res.json({ ok: true, data: { id: row.id, revoked: true } });
  } catch (err) { next(err); }
});

/** Student / Teacher ID card data (print view built on the client). */
router.get('/id-card/student/:id', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [st] = await db.select({ s: students, className: classes.name })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(and(eq(students.id, req.params.id), eq(students.schoolId, schoolId))).limit(1);
    if (!st) throw ApiError.notFound('Student not found');
    if (['student', 'parent'].includes(req.auth!.role)) {
      const [me] = await db.select({ id: students.id }).from(students).where(eq(students.userId, req.auth!.id)).limit(1);
      if (!me || me.id !== st.s.id) throw ApiError.forbidden('You can only view your own ID card');
    }
    const sec = st.s.sectionId
      ? await db.select().from(sections).where(eq(sections.id, st.s.sectionId)).limit(1)
      : [];
    const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
    res.json({
      ok: true,
      data: {
        student: st.s, className: st.className, sectionName: sec[0]?.name ?? null, school,
      },
    });
  } catch (err) { next(err); }
});

export default router;
