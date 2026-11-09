import { pgTable, uuid, text, timestamp, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** Customizable document/certificate templates (Nepali & English). */
export const certificateTemplates = pgTable(
  'certificate_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    type: text('type').notNull(),
    // admission_form | student_id | teacher_id | character | transfer | migration | bonafide |
    // study | experience | appointment | salary | leave | recommendation | fee_receipt | admit_card |
    // grade_sheet | progress | meeting_minutes | official_letter | notice
    name: text('name').notNull(),
    locale: text('locale').notNull().default('en'), // en | ne | both
    bodyHtml: text('body_html').notNull(),
    signatureFields: jsonb('signature_fields')
      .$type<{ label: string; role: string }[]>()
      .default([{ label: 'Principal / Headteacher', role: 'principal' }]),
    useSchoolLogo: boolean('use_school_logo').notNull().default(true),
    useSchoolStamp: boolean('use_school_stamp').notNull().default(true),
    pageSize: text('page_size').default('a4'), // a4 | a4_landscape | legal
    isDefault: boolean('is_default').notNull().default(false),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('cert_template_uq').on(t.schoolId, t.type, t.name)],
);

/** Generated certificates with serial numbers. */
export const issuedCertificates = pgTable(
  'issued_certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    type: text('type').notNull(),
    templateId: uuid('template_id'),
    studentId: uuid('student_id'),
    employeeId: uuid('employee_id'),
    serialNo: text('serial_no').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().default({}),
    issuedAt: timestamp('issued_at').defaultNow().notNull(),
    issuedBy: uuid('issued_by'),
    revokedAt: timestamp('revoked_at'),
  },
  (t) => [
    uniqueIndex('cert_serial_uq').on(t.schoolId, t.serialNo),
    index('cert_student_idx').on(t.studentId),
  ],
);
