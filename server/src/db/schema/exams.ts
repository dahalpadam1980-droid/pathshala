import { pgTable, uuid, text, timestamp, integer, numeric, boolean, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Grading configuration — fully data-driven, NEVER hardcoded.
 * Schools can create scales (e.g. NEB SEE, school terminal exams) with grade bands.
 */
export const gradingScales = pgTable(
  'grading_scales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(), // e.g. default, neb_see, neb_11_12, custom
    description: text('description'),
    classId: uuid('class_id'), // null = applies broadly
    examType: text('exam_type'), // null = applies to all exam types
    gpaFormula: text('gpa_formula').default('weighted'), // weighted | average
    ngThresholdPercent: numeric('ng_threshold_percent', { precision: 5, scale: 2 }).default('0'),
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('grading_scales_school_idx').on(t.schoolId)],
);

export const gradeBands = pgTable(
  'grade_bands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scaleId: uuid('scale_id').notNull(),
    minPercent: numeric('min_percent', { precision: 6, scale: 2 }).notNull(),
    maxPercent: numeric('max_percent', { precision: 6, scale: 2 }).notNull(),
    letter: text('letter').notNull(), // A+ , A, B+ ...
    gradePoint: numeric('grade_point', { precision: 4, scale: 2 }).notNull(),
    remark: text('remark'),
    isNg: boolean('is_ng').notNull().default(false), // NG status
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('grade_bands_scale_idx').on(t.scaleId)],
);

/** Examination (terminal, unit test, SEE prep, NEB ...). */
export const exams = pgTable(
  'exams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    name: text('name').notNull(),
    nameNe: text('name_ne'),
    type: text('type').notNull().default('terminal'),
    // terminal_1 | terminal_2 | terminal_3 | final | unit | monthly | practical | internal | ble | see_prep | neb | custom
    classId: uuid('class_id'), // null = applies to whole school
    startDate: date('start_date'),
    endDate: date('end_date'),
    gradingScaleId: uuid('grading_scale_id'),
    status: text('status').notNull().default('draft'), // draft | marks_entry | published | locked
    routinePublished: boolean('routine_published').notNull().default(false),
    publishedAt: timestamp('published_at'),
    publishedBy: uuid('published_by'),
    lockedAt: timestamp('locked_at'),
    remarks: text('remarks'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('exams_school_idx').on(t.schoolId, t.academicYearId)],
);

/** Subject-wise exam configuration (full/pass marks per exam+class). */
export const examSubjects = pgTable(
  'exam_subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    examId: uuid('exam_id').notNull(),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    theoryFull: integer('theory_full').notNull().default(75),
    theoryPass: integer('theory_pass').notNull().default(24),
    practicalFull: integer('practical_full').notNull().default(25),
    practicalPass: integer('practical_pass').notNull().default(9),
    internalFull: integer('internal_full').notNull().default(0),
    internalPass: integer('internal_pass').notNull().default(0),
    creditHours: numeric('credit_hours', { precision: 4, scale: 1 }).default('0'),
    examDate: date('exam_date'),
    startTime: text('start_time'),
    room: text('room'),
    invigilatorId: uuid('invigilator_id'),
  },
  (t) => [uniqueIndex('exam_subject_uq').on(t.examId, t.classId, t.subjectId)],
);

/** Marks & computed grades per student per exam subject. */
export const marks = pgTable(
  'marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    examSubjectId: uuid('exam_subject_id').notNull(),
    studentId: uuid('student_id').notNull(),
    theoryObtained: numeric('theory_obtained', { precision: 6, scale: 2 }),
    practicalObtained: numeric('practical_obtained', { precision: 6, scale: 2 }),
    internalObtained: numeric('internal_obtained', { precision: 6, scale: 2 }),
    total: numeric('total', { precision: 6, scale: 2 }).default('0'),
    maxTotal: numeric('max_total', { precision: 6, scale: 2 }).default('0'),
    percent: numeric('percent', { precision: 6, scale: 2 }).default('0'),
    isAbsent: boolean('is_absent').notNull().default(false),
    isPassed: boolean('is_passed').notNull().default(false),
    gradeLetter: text('grade_letter'),
    gradePoint: numeric('grade_point', { precision: 4, scale: 2 }),
    remark: text('remark'),
    enteredBy: uuid('entered_by'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('marks_uq').on(t.examSubjectId, t.studentId)],
);

/** Examination routine rows (date/period/room/invigilator) generated or manual. */
export const examRoutine = pgTable(
  'exam_routine',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    examId: uuid('exam_id').notNull(),
    classId: uuid('class_id'),
    date: date('date').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    subjectId: uuid('subject_id'),
    room: text('room'),
    invigilatorIds: jsonb('invigilator_ids').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('exam_routine_idx').on(t.examId)],
);
