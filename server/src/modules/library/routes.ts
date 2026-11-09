import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { books, bookIssues, students, employees } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const READ = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'] as const;
const WRITE = ['super_admin', 'school_admin', 'office'] as const;

router.get('/books', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const filters: any[] = [eq(books.schoolId, req.auth!.schoolId!)];
    if (req.query.category) filters.push(eq(books.category, String(req.query.category)));
    if (req.query.q) filters.push(sql`(${books.title} ILIKE ${'%' + req.query.q + '%'} OR ${books.author} ILIKE ${'%' + req.query.q + '%'} OR ${books.accessionNo} ILIKE ${'%' + req.query.q + '%'} OR ${books.isbn} ILIKE ${'%' + req.query.q + '%'})`);
    const rows = await db.select().from(books).where(and(...filters)).orderBy(asc(books.title)).limit(500);
    const [summary] = await db.select({
      titles: sql<number>`count(*)::int`,
      copies: sql<number>`coalesce(sum(${books.quantity}), 0)::int`,
      available: sql<number>`coalesce(sum(${books.available}), 0)::int`,
    }).from(books).where(eq(books.schoolId, req.auth!.schoolId!));
    res.json({ ok: true, data: rows, meta: summary });
  } catch (err) { next(err); }
});

router.post('/books', requireRole(...WRITE), validateBody(z.object({
  accessionNo: z.string().min(1).max(40),
  isbn: z.string().max(40).optional().nullable(),
  title: z.string().min(1).max(300),
  titleNe: z.string().max(300).optional().nullable(),
  author: z.string().max(200).optional().nullable(),
  publisher: z.string().max(200).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  edition: z.string().max(60).optional().nullable(),
  language: z.string().max(40).default('en'),
  price: z.number().min(0).max(10000000).default(0),
  quantity: z.number().int().min(1).max(10000).default(1),
  shelf: z.string().max(60).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [dupe] = await db.select({ id: books.id }).from(books)
      .where(and(eq(books.schoolId, schoolId), eq(books.accessionNo, req.body.accessionNo))).limit(1);
    if (dupe) throw ApiError.conflict('Accession number already exists');
    const [row] = await db.insert(books).values({
      ...req.body, schoolId, available: req.body.quantity, price: String(req.body.price),
    }).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'book', entityId: row.id, detail: { title: row.title }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/books/:id', requireRole(...WRITE), validateBody(z.object({
  title: z.string().min(1).max(300).optional(),
  titleNe: z.string().max(300).optional().nullable(),
  author: z.string().max(200).optional().nullable(),
  publisher: z.string().max(200).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  edition: z.string().max(60).optional().nullable(),
  price: z.number().min(0).optional(),
  quantity: z.number().int().min(1).max(10000).optional(),
  shelf: z.string().max(60).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['available', 'lost', 'damaged']).optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const body: any = { ...req.body };
    if (body.price != null) body.price = String(body.price);
    const [row] = await db.update(books).set(body)
      .where(and(eq(books.id, req.params.id), eq(books.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Book not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/books/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const active = await db.select({ id: bookIssues.id }).from(bookIssues)
      .where(and(eq(bookIssues.bookId, req.params.id), sql`${bookIssues.returnedAt} is null`)).limit(1);
    if (active.length) throw ApiError.badRequest('This book has active issues and cannot be deleted');
    const [row] = await db.delete(books)
      .where(and(eq(books.id, req.params.id), eq(books.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Book not found');
    await db.delete(bookIssues).where(eq(bookIssues.bookId, row.id));
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

router.get('/issues', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const filters: any[] = [eq(bookIssues.schoolId, req.auth!.schoolId!)];
    if (req.query.status === 'active') filters.push(sql`${bookIssues.returnedAt} is null`);
    if (req.query.status === 'returned') filters.push(sql`${bookIssues.returnedAt} is not null`);
    if (req.query.bookId) filters.push(eq(bookIssues.bookId, String(req.query.bookId)));
    const rows = await db
      .select({
        id: bookIssues.id, issuedAt: bookIssues.issuedAt, dueDate: bookIssues.dueDate,
        returnedAt: bookIssues.returnedAt, fine: bookIssues.fine, finePaid: bookIssues.finePaid,
        issuedToType: bookIssues.issuedToType, remarks: bookIssues.remarks,
        bookTitle: books.title, accessionNo: books.accessionNo,
        studentName: students.nameEn, employeeName: employees.nameEn,
      })
      .from(bookIssues)
      .leftJoin(books, eq(books.id, bookIssues.bookId))
      .leftJoin(students, eq(students.id, bookIssues.issuedToId))
      .leftJoin(employees, eq(employees.id, bookIssues.issuedToId))
      .where(and(...filters))
      .orderBy(desc(bookIssues.issuedAt)).limit(500);
    const today = new Date().toISOString().slice(0, 10);
    res.json({
      ok: true,
      data: rows.map((r) => ({
        ...r, fine: Number(r.fine),
        overdue: !r.returnedAt && r.dueDate < today,
        borrower: r.issuedToType === 'student' ? r.studentName : r.employeeName,
      })),
    });
  } catch (err) { next(err); }
});

router.post('/issues', requireRole(...WRITE), validateBody(z.object({
  bookId: z.string().uuid(),
  issuedToType: z.enum(['student', 'employee']),
  issuedToId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remarks: z.string().max(500).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [book] = await db.select().from(books)
      .where(and(eq(books.id, req.body.bookId), eq(books.schoolId, schoolId))).limit(1);
    if (!book) throw ApiError.notFound('Book not found');
    if (book.available <= 0) throw ApiError.badRequest('No copies available for this book');
    if (req.body.issuedToType === 'student') {
      const [st] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.id, req.body.issuedToId), eq(students.schoolId, schoolId))).limit(1);
      if (!st) throw ApiError.notFound('Student not found');
    } else {
      const [emp] = await db.select({ id: employees.id }).from(employees)
        .where(and(eq(employees.id, req.body.issuedToId), eq(employees.schoolId, schoolId))).limit(1);
      if (!emp) throw ApiError.notFound('Employee not found');
    }
    const [row] = await db.insert(bookIssues).values({
      ...req.body, schoolId, issuedBy: req.auth!.id,
    }).returning();
    await db.update(books).set({ available: book.available - 1 }).where(eq(books.id, book.id));
    await audit(db, { schoolId, userId: req.auth!.id, action: 'issue_book', entity: 'book_issue', entityId: row.id, detail: { bookId: book.id }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.post('/issues/:id/return', requireRole(...WRITE), validateBody(z.object({
  finePerDay: z.number().min(0).max(10000).default(0),
  waiveFine: z.boolean().default(false),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [issue] = await db.select().from(bookIssues)
      .where(and(eq(bookIssues.id, req.params.id), eq(bookIssues.schoolId, schoolId))).limit(1);
    if (!issue) throw ApiError.notFound('Issue not found');
    if (issue.returnedAt) throw ApiError.badRequest('Already returned');

    const today = new Date();
    const due = new Date(issue.dueDate);
    const overdueDays = Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000));
    const fine = req.body.waiveFine ? 0 : Math.round(overdueDays * req.body.finePerDay * 100) / 100;

    const [row] = await db.update(bookIssues).set({
      returnedAt: new Date(), fine: String(fine), finePaid: req.body.waiveFine || fine === 0,
    }).where(eq(bookIssues.id, issue.id)).returning();
    const [book] = await db.select().from(books).where(eq(books.id, issue.bookId)).limit(1);
    if (book) await db.update(books).set({ available: Math.min(book.quantity, book.available + 1) }).where(eq(books.id, book.id));
    await audit(db, { schoolId, userId: req.auth!.id, action: 'return_book', entity: 'book_issue', entityId: row.id, detail: { fine, overdueDays }, ip: req.ip });
    res.json({ ok: true, data: { ...row, fine: Number(row.fine), overdueDays } });
  } catch (err) { next(err); }
});

router.delete('/issues/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(bookIssues)
      .where(and(eq(bookIssues.id, req.params.id), eq(bookIssues.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Issue not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

export default router;
