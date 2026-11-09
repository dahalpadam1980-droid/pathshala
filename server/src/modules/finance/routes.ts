import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import {
  feeHeads, feeStructures, feeStructureItems, studentFees, payments, paymentItems,
  scholarships, accountHeads, transactions, students, classes as classTable, classes, sections,
  academicYears, schools,
} from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool, requireFinanceRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { monthEndKey } from '../../lib/bsdate.js';import { toCsv, toXlsx, type ExportColumn } from '../../lib/excel.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const READ = ['super_admin', 'school_admin', 'accountant', 'office'] as const;
const FINANCE = ['super_admin', 'school_admin', 'accountant'] as const;

// ================= Fee heads =================
router.get('/fee-heads', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(feeHeads)
      .where(and(eq(feeHeads.schoolId, req.auth!.schoolId!), req.query.active ? eq(feeHeads.active, true) : undefined))
      .orderBy(asc(feeHeads.orderIndex), asc(feeHeads.nameEn));
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/fee-heads', requireRole(...FINANCE), validateBody(z.object({
  code: z.string().max(30).optional().nullable(),
  nameEn: z.string().min(1).max(120),
  nameNe: z.string().max(120).optional().nullable(),
  frequency: z.enum(['monthly', 'annual', 'one_time', 'event', 'quarterly']).default('monthly'),
  description: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
  orderIndex: z.number().int().default(0),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(feeHeads).values({ ...req.body, schoolId: req.auth!.schoolId! }).returning();
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'create', entity: 'fee_head', entityId: row.id, detail: { nameEn: row.nameEn }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/fee-heads/:id', requireRole(...FINANCE), validateBody(z.object({
  nameEn: z.string().min(1).max(120).optional(),
  nameNe: z.string().max(120).optional().nullable(),
  frequency: z.enum(['monthly', 'annual', 'one_time', 'event', 'quarterly']).optional(),
  description: z.string().max(500).optional().nullable(),
  active: z.boolean().optional(),
  orderIndex: z.number().int().optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(feeHeads).set(req.body)
      .where(and(eq(feeHeads.id, req.params.id), eq(feeHeads.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Fee head not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/fee-heads/:id', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const used = await db.select({ id: studentFees.id }).from(studentFees).where(eq(studentFees.feeHeadId, req.params.id)).limit(1);
    if (used.length) throw ApiError.badRequest('This fee head has generated dues and cannot be deleted. Deactivate it instead.');
    const [row] = await db.delete(feeHeads)
      .where(and(eq(feeHeads.id, req.params.id), eq(feeHeads.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Fee head not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Fee structures =================
router.get('/fee-structures', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const structures = await db
      .select({ s: feeStructures, className: classTable.name })
      .from(feeStructures)
      .leftJoin(classTable, eq(classTable.id, feeStructures.classId))
      .where(and(eq(feeStructures.schoolId, schoolId), req.query.academicYearId ? eq(feeStructures.academicYearId, String(req.query.academicYearId)) : undefined))
      .orderBy(asc(classTable.orderIndex));
    const items = structures.length
      ? await db.select().from(feeStructureItems).where(inArray(feeStructureItems.structureId, structures.map((x) => x.s.id)))
      : [];
    const heads = await db.select().from(feeHeads).where(eq(feeHeads.schoolId, schoolId));
    res.json({
      ok: true,
      data: structures.map(({ s, className }) => ({
        ...s, className,
        items: items.filter((i) => i.structureId === s.id).map((i) => ({
          ...i, amount: Number(i.amount),
          headName: heads.find((h) => h.id === i.feeHeadId)?.nameEn ?? 'Fee',
          headNameNe: heads.find((h) => h.id === i.feeHeadId)?.nameNe ?? null,
          frequency: heads.find((h) => h.id === i.feeHeadId)?.frequency ?? 'monthly',
        })),
      })),
    });
  } catch (err) { next(err); }
});

router.post('/fee-structures', requireRole(...FINANCE), validateBody(z.object({
  academicYearId: z.string().uuid().optional().nullable(),
  classId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  items: z.array(z.object({ feeHeadId: z.string().uuid(), amount: z.number().min(0).max(10000000) })).min(1),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    let yearId = req.body.academicYearId;
    if (!yearId) {
      const [year] = await db.select({ id: academicYears.id }).from(academicYears)
        .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true))).limit(1);
      yearId = year?.id ?? null;
    }
    const [dupe] = await db.select({ id: feeStructures.id }).from(feeStructures)
      .where(and(eq(feeStructures.schoolId, schoolId), eq(feeStructures.classId, req.body.classId), eq(feeStructures.academicYearId, yearId ?? ''))).limit(1);
    if (dupe) throw ApiError.conflict('A fee structure already exists for this class and year. Edit it instead.');

    const [structure] = await db.insert(feeStructures).values({
      schoolId, academicYearId: yearId, classId: req.body.classId,
      name: req.body.name ?? 'Standard fee structure', createdBy: req.auth!.id,
    }).returning();
    await db.insert(feeStructureItems).values((req.body.items as any[]).map((i: any) => ({ structureId: structure.id, feeHeadId: i.feeHeadId, amount: String(i.amount) })));
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'fee_structure', entityId: structure.id, detail: { classId: req.body.classId, items: req.body.items.length }, ip: req.ip });
    res.status(201).json({ ok: true, data: structure });
  } catch (err) { next(err); }
});

router.patch('/fee-structures/:id', requireRole(...FINANCE), validateBody(z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
  items: z.array(z.object({ feeHeadId: z.string().uuid(), amount: z.number().min(0).max(10000000) })).optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [existing] = await db.select().from(feeStructures)
      .where(and(eq(feeStructures.id, req.params.id), eq(feeStructures.schoolId, schoolId))).limit(1);
    if (!existing) throw ApiError.notFound('Fee structure not found');
    const { items, ...updates } = req.body;
    if (Object.keys(updates).length) await db.update(feeStructures).set(updates).where(eq(feeStructures.id, existing.id));
    if (items) {
      await db.delete(feeStructureItems).where(eq(feeStructureItems.structureId, existing.id));
      await db.insert(feeStructureItems).values((items as any[]).map((i: any) => ({ structureId: existing.id, feeHeadId: i.feeHeadId, amount: String(i.amount) })));
    }
    res.json({ ok: true, data: { id: existing.id, updated: true } });
  } catch (err) { next(err); }
});

router.delete('/fee-structures/:id', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [existing] = await db.select().from(feeStructures)
      .where(and(eq(feeStructures.id, req.params.id), eq(feeStructures.schoolId, req.auth!.schoolId!))).limit(1);
    if (!existing) throw ApiError.notFound('Fee structure not found');
    await db.delete(feeStructureItems).where(eq(feeStructureItems.structureId, existing.id));
    await db.delete(feeStructures).where(eq(feeStructures.id, existing.id));
    res.json({ ok: true, data: { id: existing.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Generate student dues =================
router.post('/student-fees/generate', requireRole(...FINANCE), validateBody(z.object({
  academicYearId: z.string().uuid().optional().nullable(),
  classId: z.string().uuid().optional().nullable(),
  feeHeadId: z.string().uuid(),
  label: z.string().min(1).max(200),
  period: z.string().max(20).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  amount: z.number().min(0).max(10000000).optional(), // if omitted: from fee structure
  overwrite: z.boolean().default(false),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const p = req.body;
    let yearId = p.academicYearId;
    if (!yearId) {
      const [year] = await db.select({ id: academicYears.id }).from(academicYears)
        .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.isCurrent, true))).limit(1);
      yearId = year?.id ?? null;
    }

    const studentFilters: any[] = [eq(students.schoolId, schoolId), eq(students.status, 'active')];
    if (p.classId) studentFilters.push(eq(students.classId, p.classId));
    const studentRows = await db.select().from(students).where(and(...studentFilters));
    if (!studentRows.length) throw ApiError.badRequest('No active students found for the selected criteria');

    // amounts from fee structure per class (unless explicit amount given)
    const structures = p.amount == null
      ? await db.select().from(feeStructures).where(and(eq(feeStructures.schoolId, schoolId), yearId ? eq(feeStructures.academicYearId, yearId) : undefined))
      : [];
    const structItems = structures.length ? await db.select().from(feeStructureItems).where(inArray(feeStructureItems.structureId, structures.map((s) => s.id))) : [];
    const amountByClass = new Map<string, number>();
    for (const s of structures) {
      const item = structItems.find((i) => i.structureId === s.id && i.feeHeadId === p.feeHeadId);
      if (item) amountByClass.set(s.classId, Number(item.amount));
    }

    let created = 0;
    let skipped = 0;
    for (const st of studentRows) {
      const amount = p.amount ?? (st.classId ? amountByClass.get(st.classId) : undefined);
      if (amount == null || amount <= 0) { skipped++; continue; }

      const [existing] = await db.select({ id: studentFees.id, status: studentFees.status }).from(studentFees)
        .where(and(
          eq(studentFees.schoolId, schoolId), eq(studentFees.studentId, st.id),
          eq(studentFees.feeHeadId, p.feeHeadId),
          p.period ? eq(studentFees.period, p.period) : sql`${studentFees.period} is null`,
          eq(studentFees.label, p.label),
        )).limit(1);
      if (existing && !p.overwrite) { skipped++; continue; }

      // apply active scholarships as discount
      const scholarRows = await db.select().from(scholarships)
        .where(and(eq(scholarships.schoolId, schoolId), eq(scholarships.studentId, st.id), eq(scholarships.active, true)));
      const discountPct = scholarRows.reduce((sum, s) => sum + Number(s.percent ?? 0), 0);
      const discount = Math.min(amount, Math.round((amount * Math.min(discountPct, 100)) / 100));

      if (existing) {
        await db.update(studentFees).set({ amount: String(amount), discount: String(discount), dueDate: p.dueDate ?? null }).where(eq(studentFees.id, existing.id));
      } else {
        await db.insert(studentFees).values({
          schoolId, studentId: st.id, feeHeadId: p.feeHeadId, academicYearId: yearId,
          label: p.label, period: p.period ?? null, dueDate: p.dueDate ?? null,
          amount: String(amount), discount: String(discount), createdBy: req.auth!.id,
        });
      }
      created++;
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'generate_fees', entity: 'student_fee', detail: { label: p.label, created, skipped }, ip: req.ip });
    res.json({ ok: true, data: { created, skipped, students: studentRows.length } });
  } catch (err) { next(err); }
});

router.get('/student-fees', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(studentFees.schoolId, schoolId)];
    if (req.query.studentId) filters.push(eq(studentFees.studentId, String(req.query.studentId)));
    if (req.query.status) filters.push(eq(studentFees.status, String(req.query.status)));
    if (req.query.classId) filters.push(eq(students.classId, String(req.query.classId)));
    if (req.query.feeHeadId) filters.push(eq(studentFees.feeHeadId, String(req.query.feeHeadId)));
    if (req.query.period) filters.push(eq(studentFees.period, String(req.query.period)));

    const rows = await db
      .select({
        id: studentFees.id, studentId: studentFees.studentId, label: studentFees.label, period: studentFees.period,
        dueDate: studentFees.dueDate, amount: studentFees.amount, discount: studentFees.discount,
        fine: studentFees.fine, paidAmount: studentFees.paidAmount, status: studentFees.status,
        feeHeadId: studentFees.feeHeadId,
        studentName: students.nameEn, admissionNo: students.admissionNo, rollNo: students.rollNo,
        className: classTable.name, sectionName: sections.name,
        headName: feeHeads.nameEn,
      })
      .from(studentFees)
      .innerJoin(students, eq(students.id, studentFees.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .leftJoin(feeHeads, eq(feeHeads.id, studentFees.feeHeadId))
      .where(and(...filters))
      .orderBy(desc(studentFees.createdAt)).limit(1000);

    const data = rows.map((r) => {
      const due = Number(r.amount) - Number(r.discount) + Number(r.fine);
      return { ...r, amount: Number(r.amount), discount: Number(r.discount), fine: Number(r.fine), paidAmount: Number(r.paidAmount), due: Math.max(0, due - Number(r.paidAmount)) };
    });
    const outstanding = data.reduce((s, r) => s + r.due, 0);
    res.json({ ok: true, data, meta: { outstanding: Math.round(outstanding * 100) / 100, rows: data.length } });
  } catch (err) { next(err); }
});

router.patch('/student-fees/:id', requireRole(...FINANCE), validateBody(z.object({
  label: z.string().min(1).max(300).optional(),
  fine: z.number().min(0).max(1000000).optional(),
  discount: z.number().min(0).max(1000000).optional(),
  status: z.enum(['unpaid', 'partial', 'paid', 'waived']).optional(),
  waivedReason: z.string().max(500).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const body: any = { ...req.body };
    if (body.fine != null) body.fine = String(body.fine);
    if (body.discount != null) body.discount = String(body.discount);
    if (!Object.keys(body).length) throw ApiError.badRequest('No updatable fields supplied');
    const [row] = await db.update(studentFees).set(body)
      .where(and(eq(studentFees.id, req.params.id), eq(studentFees.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Fee record not found');
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'update', entity: 'student_fee', entityId: row.id, detail: body, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/student-fees/:id', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [existing] = await db.select().from(studentFees)
      .where(and(eq(studentFees.id, req.params.id), eq(studentFees.schoolId, req.auth!.schoolId!))).limit(1);
    if (!existing) throw ApiError.notFound('Fee record not found');
    if (Number(existing.paidAmount) > 0) throw ApiError.badRequest('This fee has payments against it and cannot be deleted');
    await db.delete(studentFees).where(eq(studentFees.id, existing.id));
    res.json({ ok: true, data: { id: existing.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Payments =================
router.get('/payments', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(payments.schoolId, schoolId)];
    if (req.query.studentId) filters.push(eq(payments.studentId, String(req.query.studentId)));
    if (req.query.method) filters.push(eq(payments.method, String(req.query.method)));
    if (req.query.from) filters.push(sql`${payments.paidAt} >= ${String(req.query.from)}`);
    if (req.query.to) filters.push(sql`${payments.paidAt} <= ${String(req.query.to)} 23:59:59`);

    const rows = await db
      .select({
        id: payments.id, receiptNo: payments.receiptNo, amount: payments.amount, method: payments.method,
        reference: payments.reference, paidAt: payments.paidAt, remarks: payments.remarks,
        studentId: payments.studentId, studentName: students.nameEn, admissionNo: students.admissionNo,
        className: classTable.name, sectionName: sections.name,
      })
      .from(payments)
      .innerJoin(students, eq(students.id, payments.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(and(...filters))
      .orderBy(desc(payments.paidAt)).limit(500);
    res.json({ ok: true, data: rows.map((r) => ({ ...r, amount: Number(r.amount) })) });
  } catch (err) { next(err); }
});

async function nextReceiptNo(schoolId: string): Promise<string> {
  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(payments).where(eq(payments.schoolId, schoolId));
  for (let n = count + 1; n < count + 50; n++) {
    const candidate = `RCP-${String(n).padStart(6, '0')}`;
    const [dupe] = await db.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.schoolId, schoolId), eq(payments.receiptNo, candidate))).limit(1);
    if (!dupe) return candidate;
  }
  return `RCP-${Date.now()}`;
}

router.post('/payments', requireRole(...FINANCE), validateBody(z.object({
  studentId: z.string().uuid(),
  amount: z.number().min(0.01).max(100000000),
  method: z.enum(['cash', 'bank', 'esewa', 'khalti', 'fonepay', 'connectips', 'qr', 'cheque', 'other']).default('cash'),
  reference: z.string().max(120).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
  allocations: z.array(z.object({ studentFeeId: z.string().uuid(), amount: z.number().min(0.01) })).default([]),
  autoAllocate: z.boolean().default(true),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const p = req.body;

    const [student] = await db.select().from(students)
      .where(and(eq(students.id, p.studentId), eq(students.schoolId, schoolId))).limit(1);
    if (!student) throw ApiError.notFound('Student not found');

    // Resolve allocations (oldest unpaid dues first when autoAllocate)
    let allocs = p.allocations;
    if (allocs.length === 0 && p.autoAllocate) {
      const openFees = await db.select().from(studentFees)
        .where(and(eq(studentFees.schoolId, schoolId), eq(studentFees.studentId, p.studentId), sql`${studentFees.status} != 'paid'`))
        .orderBy(asc(studentFees.createdAt));
      let remaining = p.amount;
      allocs = [];
      for (const f of openFees) {
        if (remaining <= 0) break;
        const due = Number(f.amount) - Number(f.discount) + Number(f.fine) - Number(f.paidAmount);
        if (due <= 0) continue;
        const pay = Math.min(due, remaining);
        allocs.push({ studentFeeId: f.id, amount: Math.round(pay * 100) / 100 });
        remaining = Math.round((remaining - pay) * 100) / 100;
      }
    }
    const allocTotal = allocs.reduce((s: number, a: any) => s + Number(a.amount), 0);
    if (allocTotal - p.amount > 0.5) throw ApiError.badRequest('Allocated amount exceeds the payment amount');

    const receiptNo = await nextReceiptNo(schoolId);
    const [payment] = await db.insert(payments).values({
      schoolId, receiptNo, studentId: p.studentId, amount: String(p.amount),
      method: p.method, reference: p.reference ?? null, remarks: p.remarks ?? null,
      receivedBy: req.auth!.id,
    }).returning();

    for (const a of allocs) {
      await db.insert(paymentItems).values({ paymentId: payment.id, studentFeeId: a.studentFeeId, amount: String(a.amount) });
      const [fee] = await db.select().from(studentFees).where(eq(studentFees.id, a.studentFeeId)).limit(1);
      if (fee) {
        const newPaid = Number(fee.paidAmount) + a.amount;
        const due = Number(fee.amount) - Number(fee.discount) + Number(fee.fine);
        const status = newPaid >= due - 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
        await db.update(studentFees).set({ paidAmount: String(Math.round(newPaid * 100) / 100), status }).where(eq(studentFees.id, fee.id));
      }
    }

    // Post to income account (Student Fees head)
    const [feeHead] = await db.select().from(accountHeads)
      .where(and(eq(accountHeads.schoolId, schoolId), eq(accountHeads.group, 'fee_income'))).limit(1);
    if (feeHead) {
      await db.insert(transactions).values({
        schoolId, txnDate: new Date().toISOString().slice(0, 10), headId: feeHead.id,
        type: 'income', amount: String(p.amount), mode: p.method === 'cash' ? 'cash' : p.method === 'bank' || p.method === 'cheque' ? 'bank' : 'digital',
        category: 'fee_income', description: `Fee receipt ${receiptNo} — ${student.nameEn}`,
        reference: receiptNo, studentId: p.studentId, paymentId: payment.id, createdBy: req.auth!.id,
      });
    }

    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'payment', entityId: payment.id, detail: { receiptNo, amount: p.amount, method: p.method }, ip: req.ip });
    res.status(201).json({ ok: true, data: { ...payment, amount: Number(payment.amount), allocations: allocs.length } });
  } catch (err) { next(err); }
});

/** Full receipt with allocation details (renders in the print view). */
router.get('/payments/:id/receipt', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [payment] = await db.select().from(payments)
      .where(and(eq(payments.id, req.params.id), eq(payments.schoolId, schoolId))).limit(1);
    if (!payment) throw ApiError.notFound('Payment not found');
    const items = await db
      .select({
        amount: paymentItems.amount, label: studentFees.label, period: studentFees.period,
        feeHeadName: feeHeads.nameEn, feeHeadNameNe: feeHeads.nameNe,
      })
      .from(paymentItems)
      .innerJoin(studentFees, eq(studentFees.id, paymentItems.studentFeeId))
      .leftJoin(feeHeads, eq(feeHeads.id, studentFees.feeHeadId))
      .where(eq(paymentItems.paymentId, payment.id));
    const [student] = await db.select({
      nameEn: students.nameEn, nameNe: students.nameNe, admissionNo: students.admissionNo,
      className: classTable.name, sectionName: sections.name, rollNo: students.rollNo,
    }).from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(students.id, payment.studentId)).limit(1);
    const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
    res.json({ ok: true, data: { payment: { ...payment, amount: Number(payment.amount) }, items: items.map((i) => ({ ...i, amount: Number(i.amount) })), student, school } });
  } catch (err) { next(err); }
});

router.delete('/payments/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [payment] = await db.select().from(payments)
      .where(and(eq(payments.id, req.params.id), eq(payments.schoolId, schoolId))).limit(1);
    if (!payment) throw ApiError.notFound('Payment not found');
    const items = await db.select().from(paymentItems).where(eq(paymentItems.paymentId, payment.id));
    for (const it of items) {
      const [fee] = await db.select().from(studentFees).where(eq(studentFees.id, it.studentFeeId)).limit(1);
      if (fee) {
        const newPaid = Math.max(0, Number(fee.paidAmount) - Number(it.amount));
        const due = Number(fee.amount) - Number(fee.discount) + Number(fee.fine);
        await db.update(studentFees).set({
          paidAmount: String(newPaid),
          status: newPaid >= due - 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid',
        }).where(eq(studentFees.id, fee.id));
      }
      await db.delete(paymentItems).where(eq(paymentItems.id, it.id));
    }
    await db.delete(transactions).where(eq(transactions.paymentId, payment.id));
    await db.delete(payments).where(eq(payments.id, payment.id));
    await audit(db, { schoolId, userId: req.auth!.id, action: 'delete', entity: 'payment', entityId: payment.id, detail: { receiptNo: payment.receiptNo }, ip: req.ip });
    res.json({ ok: true, data: { id: payment.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Scholarships =================
router.get('/scholarships', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: scholarships.id, type: scholarships.type, name: scholarships.name, percent: scholarships.percent,
        amount: scholarships.amount, reason: scholarships.reason, active: scholarships.active,
        startDate: scholarships.startDate, endDate: scholarships.endDate,
        studentId: students.id, studentName: students.nameEn, admissionNo: students.admissionNo,
        className: classTable.name,
      })
      .from(scholarships)
      .innerJoin(students, eq(students.id, scholarships.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(eq(scholarships.schoolId, req.auth!.schoolId!))
      .orderBy(desc(scholarships.createdAt)).limit(500);
    res.json({ ok: true, data: rows.map((r) => ({ ...r, percent: Number(r.percent), amount: Number(r.amount) })) });
  } catch (err) { next(err); }
});

router.post('/scholarships', requireRole(...FINANCE), validateBody(z.object({
  studentId: z.string().uuid(),
  type: z.enum(['discount', 'full_waiver', 'scholarship', 'sibling', 'staff_child', 'govt']).default('discount'),
  name: z.string().max(150).optional().nullable(),
  percent: z.number().min(0).max(100).default(0),
  amount: z.number().min(0).max(10000000).default(0),
  reason: z.string().max(500).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(scholarships).values({
      ...req.body, schoolId: req.auth!.schoolId!, approvedBy: req.auth!.id,
    }).returning();
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'create', entity: 'scholarship', entityId: row.id, detail: { studentId: req.body.studentId, percent: req.body.percent }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/scholarships/:id', requireRole(...FINANCE), validateBody(z.object({
  active: z.boolean().optional(),
  percent: z.number().min(0).max(100).optional(),
  amount: z.number().min(0).max(10000000).optional(),
  reason: z.string().max(500).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const body: any = { ...req.body };
    if (body.percent != null) body.percent = String(body.percent);
    if (body.amount != null) body.amount = String(body.amount);
    const [row] = await db.update(scholarships).set(body)
      .where(and(eq(scholarships.id, req.params.id), eq(scholarships.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Scholarship not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/scholarships/:id', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(scholarships)
      .where(and(eq(scholarships.id, req.params.id), eq(scholarships.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Scholarship not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Account heads & transactions =================
router.get('/account-heads', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(accountHeads)
      .where(and(eq(accountHeads.schoolId, req.auth!.schoolId!), req.query.type ? eq(accountHeads.type, String(req.query.type)) : undefined))
      .orderBy(asc(accountHeads.code), asc(accountHeads.nameEn));
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/account-heads', requireRole(...FINANCE), validateBody(z.object({
  code: z.string().max(30).optional().nullable(),
  nameEn: z.string().min(1).max(150),
  nameNe: z.string().max(150).optional().nullable(),
  type: z.enum(['income', 'expense', 'asset', 'liability']),
  group: z.enum(['government_grant', 'local_grant', 'fee_income', 'donation', 'other_income', 'salary', 'administrative', 'teaching_material', 'infrastructure', 'utility', 'other_expense', 'asset', 'liability']),
  active: z.boolean().default(true),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(accountHeads).values({ ...req.body, schoolId: req.auth!.schoolId! }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/account-heads/:id', requireRole(...FINANCE), validateBody(z.object({
  nameEn: z.string().min(1).max(150).optional(),
  nameNe: z.string().max(150).optional().nullable(),
  active: z.boolean().optional(),
  group: z.string().max(50).optional(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(accountHeads).set(req.body)
      .where(and(eq(accountHeads.id, req.params.id), eq(accountHeads.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Account head not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.get('/transactions', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(transactions.schoolId, schoolId)];
    if (req.query.from) filters.push(sql`${transactions.txnDate} >= ${String(req.query.from)}`);
    if (req.query.to) filters.push(sql`${transactions.txnDate} <= ${String(req.query.to)}`);
    if (req.query.type) filters.push(eq(transactions.type, String(req.query.type)));
    if (req.query.headId) filters.push(eq(transactions.headId, String(req.query.headId)));
    if (req.query.category) filters.push(eq(transactions.category, String(req.query.category)));
    if (req.query.mode) filters.push(eq(transactions.mode, String(req.query.mode)));

    const rows = await db
      .select({
        id: transactions.id, txnDate: transactions.txnDate, type: transactions.type, amount: transactions.amount,
        mode: transactions.mode, category: transactions.category, description: transactions.description,
        reference: transactions.reference, createdAt: transactions.createdAt,
        headName: accountHeads.nameEn, headNameNe: accountHeads.nameNe, headCode: accountHeads.code,
      })
      .from(transactions)
      .leftJoin(accountHeads, eq(accountHeads.id, transactions.headId))
      .where(and(...filters))
      .orderBy(desc(transactions.txnDate), desc(transactions.createdAt)).limit(1000);

    const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0);
    const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0);
    res.json({
      ok: true,
      data: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
      meta: { income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100, net: Math.round((income - expense) * 100) / 100 },
    });
  } catch (err) { next(err); }
});

router.post('/transactions', requireRole(...FINANCE), validateBody(z.object({
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  headId: z.string().uuid(),
  type: z.enum(['income', 'expense']),
  amount: z.number().min(0.01).max(1000000000),
  mode: z.enum(['cash', 'bank', 'cheque', 'digital']).default('cash'),
  description: z.string().max(500).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [head] = await db.select().from(accountHeads)
      .where(and(eq(accountHeads.id, req.body.headId), eq(accountHeads.schoolId, schoolId))).limit(1);
    if (!head) throw ApiError.notFound('Account head not found');
    if (head.type !== req.body.type) throw ApiError.badRequest(`"${head.nameEn}" is an ${head.type} head, but you posted a ${req.body.type}`);
    const [row] = await db.insert(transactions).values({
      ...req.body, schoolId, amount: String(req.body.amount), category: head.group, createdBy: req.auth!.id,
    }).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'transaction', entityId: row.id, detail: { type: row.type, amount: row.amount, head: head.nameEn }, ip: req.ip });
    res.status(201).json({ ok: true, data: { ...row, amount: Number(row.amount) } });
  } catch (err) { next(err); }
});

router.delete('/transactions/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(transactions)
      .where(and(eq(transactions.id, req.params.id), eq(transactions.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Transaction not found');
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'delete', entity: 'transaction', entityId: row.id, detail: { amount: row.amount }, ip: req.ip });
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Financial reports =================

/** Dashboard summary: income vs expense by group, outstanding fees, monthly trend. */
router.get('/reports/summary', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = monthEndKey(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

    const [incomeExpense] = await db.select({
      income: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'income'), 0)::float`,
      expense: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'expense'), 0)::float`,
    }).from(transactions).where(and(
      eq(transactions.schoolId, schoolId),
      sql`${transactions.txnDate} >= ${monthStart}`, sql`${transactions.txnDate} <= ${monthEnd}`,
    ));

    const [byGroup] = await db.select({
      category: transactions.category,
      total: sql<number>`coalesce(sum(${transactions.amount}), 0)::float`,
      type: transactions.type,
    }).from(transactions).where(and(
      eq(transactions.schoolId, schoolId),
      sql`${transactions.txnDate} >= ${monthStart}`, sql`${transactions.txnDate} <= ${monthEnd}`,
    )).groupBy(transactions.category, transactions.type);

    const [fees] = await db.select({
      billed: sql<number>`coalesce(sum(${studentFees.amount} - ${studentFees.discount} + ${studentFees.fine}), 0)::float`,
      collected: sql<number>`coalesce(sum(${studentFees.paidAmount}), 0)::float`,
      outstanding: sql<number>`coalesce(sum(${studentFees.amount} - ${studentFees.discount} + ${studentFees.fine} - ${studentFees.paidAmount}), 0)::float`,
    }).from(studentFees).where(eq(studentFees.schoolId, schoolId));

    // last 6 months trend
    const trend = await db.select({
      month: sql<string>`to_char(${transactions.txnDate}, 'YYYY-MM')`,
      type: transactions.type,
      total: sql<number>`coalesce(sum(${transactions.amount}), 0)::float`,
    }).from(transactions)
      .where(and(eq(transactions.schoolId, schoolId), sql`${transactions.txnDate} >= ${new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10)}`))
      .groupBy(sql`to_char(${transactions.txnDate}, 'YYYY-MM')`, transactions.type)
      .orderBy(sql`1`);

    res.json({
      ok: true,
      data: {
        month: { income: incomeExpense.income, expense: incomeExpense.expense, net: incomeExpense.income - incomeExpense.expense },
        byGroup,
        fees: { ...fees, collectionRate: fees.billed > 0 ? Math.round((fees.collected / fees.billed) * 100) : 0 },
        trend,
      },
    });
  } catch (err) { next(err); }
});

/** Cash book / bank book. */
router.get('/reports/cashbook', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const from = String(req.query.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
    const to = String(req.query.to ?? new Date().toISOString().slice(0, 10));
    const mode = req.query.mode ? String(req.query.mode) : null; // cash | bank

    const filters: any[] = [
      eq(transactions.schoolId, schoolId),
      sql`${transactions.txnDate} >= ${from}`, sql`${transactions.txnDate} <= ${to}`,
    ];
    if (mode === 'cash') filters.push(eq(transactions.mode, 'cash'));
    if (mode === 'bank') filters.push(eq(transactions.mode, 'bank'));

    const rows = await db
      .select({
        id: transactions.id, txnDate: transactions.txnDate, type: transactions.type, amount: transactions.amount,
        mode: transactions.mode, description: transactions.description, reference: transactions.reference,
        headName: accountHeads.nameEn,
      })
      .from(transactions)
      .leftJoin(accountHeads, eq(accountHeads.id, transactions.headId))
      .where(and(...filters))
      .orderBy(asc(transactions.txnDate), asc(transactions.createdAt));

    let running = 0;
    const data = rows.map((r) => {
      running += r.type === 'income' ? Number(r.amount) : -Number(r.amount);
      return { ...r, amount: Number(r.amount), runningBalance: Math.round(running * 100) / 100 };
    });
    res.json({ ok: true, data, meta: { from, to, balance: Math.round(running * 100) / 100, mode: mode ?? 'all' } });
  } catch (err) { next(err); }
});

/** Trial balance + income & expenditure statement. */
router.get('/reports/trial-balance', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const from = String(req.query.from ?? `${new Date().getFullYear()}-01-01`);
    const to = String(req.query.to ?? new Date().toISOString().slice(0, 10));

    const rows = await db
      .select({
        headId: accountHeads.id, code: accountHeads.code, nameEn: accountHeads.nameEn, nameNe: accountHeads.nameNe,
        type: accountHeads.type, group: accountHeads.group,
        debit: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'expense'), 0)::float`,
        credit: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'income'), 0)::float`,
      })
      .from(accountHeads)
      .leftJoin(transactions, and(
        eq(transactions.headId, accountHeads.id),
        sql`${transactions.txnDate} >= ${from}`, sql`${transactions.txnDate} <= ${to}`,
      ))
      .where(eq(accountHeads.schoolId, schoolId))
      .groupBy(accountHeads.id, accountHeads.code, accountHeads.nameEn, accountHeads.nameNe, accountHeads.type, accountHeads.group)
      .orderBy(asc(accountHeads.code));

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.credit, 0);
    const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.debit, 0);

    const grouped: Record<string, { label: string; total: number }> = {};
    for (const r of rows) {
      if (!grouped[r.group]) grouped[r.group] = { label: r.group, total: 0 };
      grouped[r.group].total += r.type === 'income' ? r.credit : r.debit;
    }

    res.json({
      ok: true,
      data: rows,
      meta: {
        from, to,
        totalDebit: Math.round(totalDebit * 100) / 100,
        totalCredit: Math.round(totalCredit * 100) / 100,
        incomeStatement: {
          income: Math.round(income * 100) / 100,
          expense: Math.round(expense * 100) / 100,
          surplus: Math.round((income - expense) * 100) / 100,
        },
        byGroup: grouped,
      },
    });
  } catch (err) { next(err); }
});

/** Outstanding fees report (class-wise + student-wise). */
router.get('/reports/outstanding', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(studentFees.schoolId, schoolId), sql`${studentFees.status} != 'paid'`];
    if (req.query.classId) filters.push(eq(students.classId, String(req.query.classId)));

    const rows = await db
      .select({
        studentId: students.id, admissionNo: students.admissionNo, nameEn: students.nameEn,
        className: classTable.name, sectionName: sections.name, rollNo: students.rollNo,
        guardianPhone: students.guardianPhone, fatherPhone: students.fatherPhone,
        outstanding: sql<number>`coalesce(sum(${studentFees.amount} - ${studentFees.discount} + ${studentFees.fine} - ${studentFees.paidAmount}), 0)::float`,
        dues: sql<number>`count(*)::int`,
      })
      .from(studentFees)
      .innerJoin(students, eq(students.id, studentFees.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(and(...filters))
      .groupBy(students.id, students.admissionNo, students.nameEn, classTable.name, sections.name, students.rollNo, students.guardianPhone, students.fatherPhone)
      .orderBy(sql`outstanding desc`)
      .limit(500);

    const total = rows.reduce((s, r) => s + r.outstanding, 0);
    res.json({ ok: true, data: rows, meta: { total: Math.round(total * 100) / 100, students: rows.length } });
  } catch (err) { next(err); }
});

/** Fee collection report by month & method. */
router.get('/reports/fee-collection', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const year = Number(req.query.year ?? new Date().getFullYear());
    const rows = await db.select({
      month: sql<string>`to_char(${payments.paidAt}, 'YYYY-MM')`,
      method: payments.method,
      total: sql<number>`coalesce(sum(${payments.amount}), 0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(payments)
      .where(and(eq(payments.schoolId, schoolId), sql`extract(year from ${payments.paidAt}) = ${year}`))
      .groupBy(sql`to_char(${payments.paidAt}, 'YYYY-MM')`, payments.method)
      .orderBy(sql`1`);
    res.json({ ok: true, data: rows, meta: { year } });
  } catch (err) { next(err); }
});

/** Export outstanding fees as CSV/XLSX. */
router.get('/reports/outstanding/export', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const rows = await db
      .select({
        admissionNo: students.admissionNo, nameEn: students.nameEn, nameNe: students.nameNe,
        className: classTable.name, sectionName: sections.name, rollNo: students.rollNo,
        outstanding: sql<number>`coalesce(sum(${studentFees.amount} - ${studentFees.discount} + ${studentFees.fine} - ${studentFees.paidAmount}), 0)::float`,
      })
      .from(studentFees)
      .innerJoin(students, eq(students.id, studentFees.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(and(eq(studentFees.schoolId, schoolId), sql`${studentFees.status} != 'paid'`))
      .groupBy(students.id, students.admissionNo, students.nameEn, students.nameNe, classTable.name, sections.name, students.rollNo)
      .orderBy(sql`outstanding desc`);
    const cols: ExportColumn[] = [
      { key: 'admissionNo', header: 'Admission No' }, { key: 'nameEn', header: 'Name (English)' },
      { key: 'nameNe', header: 'Name (Nepali)' }, { key: 'className', header: 'Class' },
      { key: 'sectionName', header: 'Section' }, { key: 'rollNo', header: 'Roll No' },
      { key: 'outstanding', header: 'Outstanding (NPR)' },
    ];
    if (req.query.format === 'xlsx') {
      const buf = await toXlsx(rows, cols, 'Outstanding Fees');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="outstanding-fees.xlsx"');
      return res.send(buf);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="outstanding-fees.csv"');
    res.send(toCsv(rows, cols));
  } catch (err) { next(err); }
});

export default router;
