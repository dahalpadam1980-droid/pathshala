import { pgTable, uuid, text, timestamp, integer, jsonb, date, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core';

/** Employees: teaching and non-teaching staff. */
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    empCode: text('emp_code').notNull(),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    photoUrl: text('photo_url'),
    gender: text('gender').default('other'),
    dob: date('dob'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    municipality: text('municipality'),
    ward: integer('ward'),
    district: text('district'),
    province: text('province'),
    appointmentDate: date('appointment_date'),
    appointmentType: text('appointment_type').notNull().default('permanent'),
    // permanent | temporary | contract | rahat | private_source | grant_supported | other
    designation: text('designation'),
    level: text('level'), // govt. level for community schools e.g. "4", "5"
    subjectSpecialization: text('subject_specialization'),
    qualification: jsonb('qualification').$type<{ degree: string; board: string; year: number }[]>().default([]),
    teachingLicense: text('teaching_license'),
    isTeacher: boolean('is_teacher').notNull().default(true),
    salaryScale: jsonb('salary_scale').$type<Record<string, unknown>>().default({}),
    bankName: text('bank_name'),
    bankAccount: text('bank_account'),
    panNo: text('pan_no'), // restricted access
    leaveBalance: jsonb('leave_balance').$type<Record<string, number>>().default({}),
    userId: uuid('user_id'),
    status: text('status').notNull().default('active'), // active | suspended | retired | resigned
    endDate: date('end_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('employees_school_code_uq').on(t.schoolId, t.empCode),
    index('employees_name_idx').on(t.nameEn),
  ],
);

/** Leave applications. */
export const leaves = pgTable(
  'leaves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    leaveType: text('leave_type').notNull().default('casual'), // casual | sick | earned | maternity | study | other
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    days: integer('days').notNull().default(1),
    reason: text('reason'),
    status: text('status').notNull().default('pending'), // pending | approved | rejected
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    remarks: text('remarks'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('leaves_school_idx').on(t.schoolId, t.status)],
);

/** Service book entries. */
export const serviceRecords = pgTable(
  'service_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    recordDate: date('record_date').notNull(),
    type: text('type').notNull(), // appointment | promotion | increment | transfer | training | retirement | other
    details: text('details'),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('service_emp_idx').on(t.employeeId)],
);

/** Training & professional development. */
export const trainings = pgTable(
  'trainings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    title: text('title').notNull(),
    provider: text('provider'),
    fromDate: date('from_date'),
    toDate: date('to_date'),
    hours: integer('hours'),
    certificateNo: text('certificate_no'),
    remarks: text('remarks'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('trainings_emp_idx').on(t.employeeId)],
);
