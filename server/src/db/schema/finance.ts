import { pgTable, uuid, text, timestamp, integer, numeric, boolean, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** Fee heads (admission, tuition, exam, computer, transport ...). */
export const feeHeads = pgTable(
  'fee_heads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    code: text('code'),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    frequency: text('frequency').notNull().default('monthly'), // monthly | annual | one_time | event | quarterly
    description: text('description'),
    active: boolean('active').notNull().default(true),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('fee_heads_school_uq').on(t.schoolId, t.nameEn)],
);

/** Class-wise fee structure for an academic year. */
export const feeStructures = pgTable(
  'fee_structures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    classId: uuid('class_id').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('fee_structure_uq').on(t.schoolId, t.academicYearId, t.classId)],
);

export const feeStructureItems = pgTable(
  'fee_structure_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    structureId: uuid('structure_id').notNull(),
    feeHeadId: uuid('fee_head_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex('fee_structure_item_uq').on(t.structureId, t.feeHeadId)],
);

/** Generated student fee dues (invoice lines). */
export const studentFees = pgTable(
  'student_fees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    feeHeadId: uuid('fee_head_id').notNull(),
    academicYearId: uuid('academic_year_id').notNull(),
    label: text('label').notNull(), // e.g. "Baishakh 2082 monthly tuition"
    period: text('period'), // month key YYYY-MM or null
    dueDate: date('due_date'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
    fine: numeric('fine', { precision: 12, scale: 2 }).notNull().default('0'),
    paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    status: text('status').notNull().default('unpaid'), // unpaid | partial | paid | waived
    waivedReason: text('waived_reason'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('student_fees_idx').on(t.schoolId, t.studentId, t.status)],
);

/** Payments received (receipts). */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    receiptNo: text('receipt_no').notNull(),
    studentId: uuid('student_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    method: text('method').notNull().default('cash'), // cash | bank | esewa | khalti | fonepay | connectips | qr | cheque | other
    reference: text('reference'),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    receivedBy: uuid('received_by'),
    remarks: text('remarks'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('payments_receipt_uq').on(t.schoolId, t.receiptNo), index('payments_student_idx').on(t.studentId)],
);

/** Payment allocation to specific fee dues. */
export const paymentItems = pgTable(
  'payment_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id').notNull(),
    studentFeeId: uuid('student_fee_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index('payment_items_fee_idx').on(t.studentFeeId)],
);

/** Scholarships & concessions. */
export const scholarships = pgTable(
  'scholarships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id').notNull(),
    type: text('type').notNull().default('discount'), // discount | full_waiver | scholarship | sibling | staff_child | govt
    name: text('name'),
    percent: numeric('percent', { precision: 6, scale: 2 }).default('0'),
    amount: numeric('amount', { precision: 12, scale: 2 }).default('0'),
    reason: text('reason'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    active: boolean('active').notNull().default(true),
    approvedBy: uuid('approved_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('scholarships_student_idx').on(t.studentId)],
);

/** Chart of accounts heads — grouped for government school audit reporting. */
export const accountHeads = pgTable(
  'account_heads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    code: text('code'),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    type: text('type').notNull(), // income | expense | asset | liability
    group: text('group').notNull().default('other_income'),
    // government_grant | local_grant | fee_income | donation | other_income
    // | salary | administrative | teaching_material | infrastructure | utility | other_expense
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('account_heads_uq').on(t.schoolId, t.nameEn)],
);

/** Cash & bank book entries. */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    txnDate: date('txn_date').notNull(),
    headId: uuid('head_id').notNull(),
    type: text('type').notNull(), // income | expense
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    mode: text('mode').notNull().default('cash'), // cash | bank | cheque | digital
    category: text('category'), // mirrors account head group for fast reporting
    description: text('description'),
    reference: text('reference'),
    studentId: uuid('student_id'),
    paymentId: uuid('payment_id'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('transactions_school_date_idx').on(t.schoolId, t.txnDate), index('transactions_head_idx').on(t.headId)],
);
