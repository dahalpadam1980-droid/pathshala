import { pgTable, uuid, text, timestamp, integer, numeric, boolean, date, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    accessionNo: text('accession_no').notNull(),
    isbn: text('isbn'),
    title: text('title').notNull(),
    titleNe: text('title_ne'),
    author: text('author'),
    publisher: text('publisher'),
    category: text('category'),
    edition: text('edition'),
    language: text('language').default('en'),
    price: numeric('price', { precision: 10, scale: 2 }).default('0'),
    quantity: integer('quantity').notNull().default(1),
    available: integer('available').notNull().default(1),
    shelf: text('shelf'),
    description: text('description'),
    status: text('status').notNull().default('available'), // available | lost | damaged
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('books_accession_uq').on(t.schoolId, t.accessionNo),
    index('books_title_idx').on(t.title),
  ],
);

export const bookIssues = pgTable(
  'book_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    bookId: uuid('book_id').notNull(),
    issuedToType: text('issued_to_type').notNull().default('student'), // student | employee
    issuedToId: uuid('issued_to_id').notNull(),
    issuedBy: uuid('issued_by'),
    issuedAt: timestamp('issued_at').defaultNow().notNull(),
    dueDate: date('due_date').notNull(),
    returnedAt: timestamp('returned_at'),
    fine: numeric('fine', { precision: 8, scale: 2 }).default('0'),
    finePaid: boolean('fine_paid').notNull().default(false),
    remarks: text('remarks'),
  },
  (t) => [index('book_issues_idx').on(t.schoolId, t.bookId)],
);
