import { pgTable, uuid, text, timestamp, integer, numeric, boolean, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** Digital teaching-learning materials. */
export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    classId: uuid('class_id'),
    sectionId: uuid('section_id'),
    subjectId: uuid('subject_id'),
    title: text('title').notNull(),
    description: text('description'),
    type: text('type').notNull().default('pdf'), // pdf | doc | ppt | video | audio | link | image
    url: text('url').notNull(),
    published: boolean('published').notNull().default(true),
    teacherId: uuid('teacher_id'),
    downloads: integer('downloads').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('materials_school_idx').on(t.schoolId, t.classId)],
);

/** Homework / assignments with online submission. */
export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    classId: uuid('class_id').notNull(),
    sectionId: uuid('section_id'),
    subjectId: uuid('subject_id'),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: date('due_date'),
    totalMarks: integer('total_marks').default(100),
    attachmentUrl: text('attachment_url'),
    teacherId: uuid('teacher_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('assignments_school_idx').on(t.schoolId, t.classId)],
);

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id').notNull(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    fileUrl: text('file_url'),
    note: text('note'),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    status: text('status').notNull().default('submitted'), // submitted | late | returned
    marksObtained: integer('marks_obtained'),
    feedback: text('feedback'),
    gradedAt: timestamp('graded_at'),
    gradedBy: uuid('graded_by'),
  },
  (t) => [uniqueIndex('submission_uq').on(t.assignmentId, t.studentId)],
);

/** Online quizzes with automatic evaluation for MCQ. */
export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    classId: uuid('class_id').notNull(),
    sectionId: uuid('section_id'),
    subjectId: uuid('subject_id'),
    title: text('title').notNull(),
    description: text('description'),
    timeLimitMinutes: integer('time_limit_minutes').default(30),
    totalMarks: integer('total_marks').default(0),
    opensAt: timestamp('opens_at'),
    closesAt: timestamp('closes_at'),
    teacherId: uuid('teacher_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('quizzes_school_idx').on(t.schoolId, t.classId)],
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id').notNull(),
    type: text('type').notNull().default('mcq'), // mcq | short
    question: text('question').notNull(),
    options: jsonb('options').$type<string[]>().default([]),
    correctIndex: integer('correct_index'),
    correctAnswer: text('correct_answer'),
    marks: integer('marks').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('quiz_questions_idx').on(t.quizId)],
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id').notNull(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    submittedAt: timestamp('submitted_at'),
    answers: jsonb('answers').$type<Record<string, unknown>>().default({}),
    score: integer('score').default(0),
    maxScore: integer('max_score').default(0),
    autoEvaluated: boolean('auto_evaluated').notNull().default(false),
  },
  (t) => [uniqueIndex('quiz_attempt_uq').on(t.quizId, t.studentId)],
);
