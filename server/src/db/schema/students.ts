import { pgTable, uuid, text, timestamp, integer, jsonb, date, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** Core student record (current placement denormalized; history kept in enrollments). */
export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    admissionNo: text('admission_no').notNull(),
    studentCode: text('student_code'),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    dobBs: text('dob_bs'), // Bikram Sambat YYYY-MM-DD
    dobAd: date('dob_ad'),
    gender: text('gender').default('other'), // male | female | other
    bloodGroup: text('blood_group'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    municipality: text('municipality'),
    ward: integer('ward'),
    district: text('district'),
    province: text('province'),
    fatherName: text('father_name'),
    fatherPhone: text('father_phone'),
    fatherOccupation: text('father_occupation'),
    motherName: text('mother_name'),
    motherPhone: text('mother_phone'),
    motherOccupation: text('mother_occupation'),
    guardianName: text('guardian_name'),
    guardianRelation: text('guardian_relation'),
    guardianPhone: text('guardian_phone'),
    prevSchool: text('prev_school'),
    admissionDate: date('admission_date'),
    academicYearId: uuid('academic_year_id'),
    classId: uuid('class_id'),
    sectionId: uuid('section_id'),
    rollNo: integer('roll_no'),
    house: text('house'),
    photoUrl: text('photo_url'),
    medical: jsonb('medical').$type<Record<string, unknown>>().default({}), // restricted
    transport: jsonb('transport').$type<Record<string, unknown>>().default({}),
    notes: text('notes'),
    status: text('status').notNull().default('active'), // active | transferred | withdrawn | alumni | suspended
    userId: uuid('user_id'),
    enrolledAt: timestamp('enrolled_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('students_school_admission_uq').on(t.schoolId, t.admissionNo),
    index('students_class_idx').on(t.schoolId, t.classId, t.sectionId),
    index('students_name_idx').on(t.nameEn),
  ],
);

/** Enrollment history per academic year (supports promotion & transfers). */
export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    classId: uuid('class_id').notNull(),
    sectionId: uuid('section_id'),
    rollNo: integer('roll_no'),
    status: text('status').notNull().default('studying'), // studying | promoted | passed | repeated | withdrawn
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('enroll_uq').on(t.studentId, t.academicYearId)],
);

export const studentDocuments = pgTable(
  'student_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    type: text('type').notNull(), // birth_certificate | citizenship | previous_report | photo | other
    title: text('title').notNull(),
    fileUrl: text('file_url').notNull(),
    issuedDate: date('issued_date'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('student_docs_idx').on(t.studentId)],
);

/** Online admission applications. */
export const admissionApplications = pgTable(
  'admission_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    classApplied: text('class_applied').notNull(),
    dobAd: date('dob_ad'),
    dobBs: text('dob_bs'),
    gender: text('gender'),
    fatherName: text('father_name'),
    motherName: text('mother_name'),
    guardianPhone: text('guardian_phone'),
    address: text('address'),
    prevSchool: text('prev_school'),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
    status: text('status').notNull().default('pending'), // pending | approved | rejected | waitlist
    rejectionReason: text('rejection_reason'),
    studentId: uuid('student_id'), // set when approved & enrolled
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  },
  (t) => [index('applications_school_idx').on(t.schoolId, t.status)],
);

/** Promotion batches (class to class, academic year to year). */
export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    fromClassId: uuid('from_class_id').notNull(),
    toClassId: uuid('to_class_id').notNull(),
    studentIds: jsonb('student_ids').$type<string[]>().notNull(),
    result: jsonb('result').$type<Record<string, unknown>>().default({}),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('promotions_school_idx').on(t.schoolId)],
);
