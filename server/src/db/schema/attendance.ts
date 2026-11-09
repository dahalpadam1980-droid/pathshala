import { pgTable, uuid, text, timestamp, integer, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Daily student attendance. subjectId optional (period-wise attendance). */
export const studentAttendance = pgTable(
  'student_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    sectionId: uuid('section_id'),
    subjectId: uuid('subject_id'),
    studentId: uuid('student_id').notNull(),
    date: date('date').notNull(),
    status: text('status').notNull().default('present'), // present | absent | late | leave
    remarks: text('remarks'),
    markedBy: uuid('marked_by'),
    correctedAt: timestamp('corrected_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('student_attendance_uq').on(
      t.date,
      t.studentId,
      // Subject-less rows use the zero uuid so the unique constraint still works
      // (a plain coalesce with '' would mix uuid and text and fail in Postgres).
      sql`coalesce(${t.subjectId}, '00000000-0000-0000-0000-000000000000')`,
    ),
    index('student_attendance_section_idx').on(t.schoolId, t.date, t.sectionId),
  ],
);

/** Teacher & staff attendance with check-in/check-out. */
export const employeeAttendance = pgTable(
  'employee_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    date: date('date').notNull(),
    checkIn: text('check_in'),
    checkOut: text('check_out'),
    status: text('status').notNull().default('present'), // present | absent | late | leave | on_duty | half_day
    method: text('method').notNull().default('manual'), // manual | qr | biometric
    remarks: text('remarks'),
    markedBy: uuid('marked_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('employee_attendance_uq').on(t.date, t.employeeId),
    index('employee_attendance_school_idx').on(t.schoolId, t.date),
  ],
);
