import { pgTable, uuid, text, timestamp, integer, numeric, boolean, date, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** Classes: Nursery/ECD through Grade 12 (global per school, stable across years). */
export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    name: text('name').notNull(), // Nursery, LKG, UKG, 1 ... 12
    nameNe: text('name_ne'),
    level: text('level').notNull().default('basic'), // ecd | basic | secondary
    orderIndex: integer('order_index').notNull().default(0),
    /** How many optional subjects each student must choose (e.g. 9/10 → 2, 11/12 → 3). */
    optionalCount: integer('optional_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('classes_school_name_uq').on(t.schoolId, t.name)],
);

/** Sections inside a class (A, B, C ...). */
export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    classId: uuid('class_id').notNull(),
    name: text('name').notNull(),
    classTeacherId: uuid('class_teacher_id'), // employees.id
    room: text('room'),
    capacity: integer('capacity'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('sections_class_name_uq').on(t.classId, t.name)],
);

/** Subjects (compulsory / optional / elective). */
export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    code: text('code'),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    type: text('type').notNull().default('compulsory'), // compulsory | optional | elective
    creditHours: numeric('credit_hours', { precision: 4, scale: 1 }).default('0'),
    hasPractical: boolean('has_practical').notNull().default(false),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('subjects_school_code_uq').on(t.schoolId, t.code)],
);

/** Subject offered to a class with its mark configuration. */
export const classSubjects = pgTable(
  'class_subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    isCompulsory: boolean('is_compulsory').notNull().default(true),
    // Marks split: THEORY + INTERNAL (practical columns kept only for legacy rows,
    // defaults are 0 so new rows use the Theory/Internal pattern).
    theoryFull: integer('theory_full').notNull().default(75),
    theoryPass: integer('theory_pass').notNull().default(24),
    practicalFull: integer('practical_full').notNull().default(0),
    practicalPass: integer('practical_pass').notNull().default(0),
    internalFull: integer('internal_full').notNull().default(25),
    internalPass: integer('internal_pass').notNull().default(9),
    /** Total credit hours (theory + internal) — drives GPA weighting. */
    creditHours: numeric('credit_hours', { precision: 4, scale: 1 }).default('0'),
    theoryCreditHours: numeric('theory_credit_hours', { precision: 4, scale: 1 }).default('0'),
    internalCreditHours: numeric('internal_credit_hours', { precision: 4, scale: 1 }).default('0'),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (t) => [uniqueIndex('class_subject_uq').on(t.classId, t.subjectId)],
);

/**
 * Optional/elective subjects a student has CHOSEN for their class
 * (classes.optionalCount subjects per student, e.g. 2 in 9/10 and 3 in 11/12).
 */
export const studentSubjects = pgTable(
  'student_subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('student_subject_uq').on(t.studentId, t.subjectId),
    index('student_subjects_school_idx').on(t.schoolId),
  ],
);

/** Allocation of subject teachers to sections. */
export const subjectAssignments = pgTable(
  'subject_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    classSubjectId: uuid('class_subject_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('subject_assign_uq').on(t.sectionId, t.classSubjectId)],
);

/** Weekly class routine: one row per period. */
export const routines = pgTable(
  'routines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    sectionId: uuid('section_id').notNull(),
    day: integer('day').notNull(), // 0=Sunday ... 6=Saturday (Nepal week starts Sunday)
    periodNo: integer('period_no').notNull(),
    startTime: text('start_time').notNull(), // HH:MM 24h
    endTime: text('end_time').notNull(),
    type: text('type').notNull().default('class'), // class | break | lunch | assembly
    subjectId: uuid('subject_id'),
    employeeId: uuid('employee_id'),
    room: text('room'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('routine_slot_uq').on(t.sectionId, t.day, t.periodNo)],
);

/** Holidays, events, exam windows and vacations. */
export const schoolEvents = pgTable(
  'school_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    titleEn: text('title_en').notNull(),
    titleNe: text('title_ne'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    type: text('type').notNull().default('event'), // holiday | event | exam | vacation | meeting
    description: text('description'),
    isRecurring: boolean('is_recurring').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('events_school_idx').on(t.schoolId)],
);
