import { pgTable, uuid, text, timestamp, integer, numeric, jsonb, date, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** Per-employee salary structure (basic + allowances - deductions). */
export const salaryStructures = pgTable(
  'salary_structures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    grade: text('grade'),
    level: text('level'),
    basic: numeric('basic', { precision: 12, scale: 2 }).notNull().default('0'),
    allowances: jsonb('allowances').$type<{ name: string; amount: number }[]>().default([]),
    deductions: jsonb('deductions').$type<{ name: string; amount: number }[]>().default([]),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    isCurrent: boolean('is_current').notNull().default(true),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('salary_struct_emp_idx').on(t.employeeId)],
);

/** Monthly payroll run. */
export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    month: integer('month').notNull(), // 1-12 (AD)
    year: integer('year').notNull(),
    label: text('label'), // e.g. "Baishakh 2082"
    status: text('status').notNull().default('draft'), // draft | finalized | paid
    totalGross: numeric('total_gross', { precision: 14, scale: 2 }).default('0'),
    totalDeductions: numeric('total_deductions', { precision: 14, scale: 2 }).default('0'),
    totalNet: numeric('total_net', { precision: 14, scale: 2 }).default('0'),
    createdBy: uuid('created_by'),
    finalizedAt: timestamp('finalized_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('payroll_run_uq').on(t.schoolId, t.month, t.year)],
);

export const payrollItems = pgTable(
  'payroll_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').notNull(),
    schoolId: uuid('school_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    basic: numeric('basic', { precision: 12, scale: 2 }).notNull().default('0'),
    allowances: jsonb('allowances').$type<{ name: string; amount: number }[]>().default([]),
    deductions: jsonb('deductions').$type<{ name: string; amount: number }[]>().default([]),
    gross: numeric('gross', { precision: 12, scale: 2 }).notNull().default('0'),
    totalDeductions: numeric('total_deductions', { precision: 12, scale: 2 }).notNull().default('0'),
    net: numeric('net', { precision: 12, scale: 2 }).notNull().default('0'),
    payableDays: integer('payable_days').default(30),
    absentDays: integer('absent_days').default(0),
    status: text('status').notNull().default('pending'), // pending | paid
    paidAt: timestamp('paid_at'),
  },
  (t) => [index('payroll_items_run_idx').on(t.runId), uniqueIndex('payroll_item_uq').on(t.runId, t.employeeId)],
);
