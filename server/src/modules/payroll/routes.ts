import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { salaryStructures, payrollRuns, payrollItems, employees, accountHeads, transactions, schools } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';
import { toCsv, toXlsx, type ExportColumn } from '../../lib/excel.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const FINANCE = ['super_admin', 'school_admin', 'accountant'] as const;
const READ = ['super_admin', 'school_admin', 'accountant'] as const;

const moneyItem = z.object({ name: z.string().min(1).max(80), amount: z.number().min(0).max(10000000) });

// ================= Salary structures =================
router.get('/structures', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const filters: any[] = [eq(salaryStructures.schoolId, req.auth!.schoolId!)];
    if (req.query.employeeId) filters.push(eq(salaryStructures.employeeId, String(req.query.employeeId)));
    const rows = await db
      .select({ ss: salaryStructures, nameEn: employees.nameEn, empCode: employees.empCode, designation: employees.designation, appointmentType: employees.appointmentType })
      .from(salaryStructures)
      .leftJoin(employees, eq(employees.id, salaryStructures.employeeId))
      .where(and(...filters))
      .orderBy(asc(salaryStructures.createdAt)).limit(500);
    res.json({
      ok: true,
      data: rows.map(({ ss, ...e }) => ({
        ...ss, basic: Number(ss.basic), ...e,
        allowances: (ss.allowances ?? []).map((a) => ({ ...a, amount: Number(a.amount) })),
        deductions: (ss.deductions ?? []).map((d) => ({ ...d, amount: Number(d.amount) })),
      })),
    });
  } catch (err) { next(err); }
});

router.post('/structures', requireRole(...FINANCE), validateBody(z.object({
  employeeId: z.string().uuid(),
  grade: z.string().max(40).optional().nullable(),
  level: z.string().max(40).optional().nullable(),
  basic: z.number().min(0).max(10000000),
  allowances: z.array(moneyItem).default([]),
  deductions: z.array(moneyItem).default([]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [emp] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.id, req.body.employeeId), eq(employees.schoolId, schoolId))).limit(1);
    if (!emp) throw ApiError.notFound('Employee not found');
    await db.update(salaryStructures).set({ isCurrent: false }).where(eq(salaryStructures.employeeId, emp.id));
    const [row] = await db.insert(salaryStructures).values({
      ...req.body, schoolId, basic: String(req.body.basic), isCurrent: true, createdBy: req.auth!.id,
    }).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'salary_structure', entityId: row.id, detail: { employeeId: emp.id, basic: req.body.basic }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/structures/:id', requireRole(...FINANCE), validateBody(z.object({
  basic: z.number().min(0).max(10000000).optional(),
  grade: z.string().max(40).optional().nullable(),
  level: z.string().max(40).optional().nullable(),
  allowances: z.array(moneyItem).optional(),
  deductions: z.array(moneyItem).optional(),
  isCurrent: z.boolean().optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const body: any = { ...req.body };
    if (body.basic != null) body.basic = String(body.basic);
    const [row] = await db.update(salaryStructures).set(body)
      .where(and(eq(salaryStructures.id, req.params.id), eq(salaryStructures.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Salary structure not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/structures/:id', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(salaryStructures)
      .where(and(eq(salaryStructures.id, req.params.id), eq(salaryStructures.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Salary structure not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Payroll runs =================
router.get('/runs', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.schoolId, req.auth!.schoolId!))
      .orderBy(desc(payrollRuns.year), desc(payrollRuns.month)).limit(120);
    res.json({ ok: true, data: rows.map((r) => ({ ...r, totalGross: Number(r.totalGross), totalDeductions: Number(r.totalDeductions), totalNet: Number(r.totalNet) })) });
  } catch (err) { next(err); }
});

router.post('/runs', requireRole(...FINANCE), validateBody(z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2070).max(2100),
  label: z.string().max(60).optional().nullable(),
  absentDaysDefault: z.number().int().min(0).max(31).default(0),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const p = req.body;
    const [dupe] = await db.select({ id: payrollRuns.id }).from(payrollRuns)
      .where(and(eq(payrollRuns.schoolId, schoolId), eq(payrollRuns.month, p.month), eq(payrollRuns.year, p.year))).limit(1);
    if (dupe) throw ApiError.conflict('A payroll run for this month/year already exists');

    const structures = await db.select().from(salaryStructures)
      .where(and(eq(salaryStructures.schoolId, schoolId), eq(salaryStructures.isCurrent, true)));
    if (!structures.length) throw ApiError.badRequest('No salary structures defined. Set up salary structures first.');

    const empIds = structures.map((s) => s.employeeId);
    const emps = await db.select().from(employees).where(inArray(employees.id, empIds));

    const [run] = await db.insert(payrollRuns).values({
      schoolId, month: p.month, year: p.year, label: p.label ?? `${p.month}/${p.year}`,
      createdBy: req.auth!.id,
    }).returning();

    let totalGross = 0, totalDeductions = 0, totalNet = 0;
    const items: any[] = [];
    for (const ss of structures) {
      const emp = emps.find((e) => e.id === ss.employeeId);
      if (!emp || emp.status !== 'active') continue;
      const allowances = (ss.allowances ?? []).map((a) => ({ name: a.name, amount: Number(a.amount) }));
      const deductions = (ss.deductions ?? []).map((d) => ({ name: d.name, amount: Number(d.amount) }));
      const basic = Number(ss.basic);
      const gross = basic + allowances.reduce((s, a) => s + a.amount, 0);
      const totalDed = deductions.reduce((s, d) => s + d.amount, 0);
      const net = gross - totalDed;
      totalGross += gross; totalDeductions += totalDed; totalNet += net;
      items.push({
        runId: run.id, schoolId, employeeId: ss.employeeId, basic: String(basic),
        allowances, deductions, gross: String(gross), totalDeductions: String(totalDed),
        net: String(net), payableDays: 30, absentDays: p.absentDaysDefault,
      });
    }
    if (items.length) await db.insert(payrollItems).values(items);
    await db.update(payrollRuns).set({
      totalGross: String(totalGross), totalDeductions: String(totalDeductions), totalNet: String(totalNet),
    }).where(eq(payrollRuns.id, run.id));

    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'payroll_run', entityId: run.id, detail: { month: p.month, year: p.year, items: items.length, totalNet }, ip: req.ip });
    res.status(201).json({ ok: true, data: { ...run, totalGross, totalDeductions, totalNet, items: items.length } });
  } catch (err) { next(err); }
});

router.get('/runs/:id', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.schoolId, req.auth!.schoolId!))).limit(1);
    if (!run) throw ApiError.notFound('Payroll run not found');
    const rows = await db
      .select({
        item: payrollItems, nameEn: employees.nameEn, nameNe: employees.nameNe, empCode: employees.empCode,
        designation: employees.designation, appointmentType: employees.appointmentType, bankName: employees.bankName,
        bankAccount: employees.bankAccount,
      })
      .from(payrollItems)
      .leftJoin(employees, eq(employees.id, payrollItems.employeeId))
      .where(eq(payrollItems.runId, run.id))
      .orderBy(asc(employees.nameEn));
    res.json({
      ok: true,
      data: {
        ...run,
        totalGross: Number(run.totalGross), totalDeductions: Number(run.totalDeductions), totalNet: Number(run.totalNet),
        items: rows.map(({ item, ...e }) => ({
          ...item, basic: Number(item.basic), gross: Number(item.gross),
          totalDeductions: Number(item.totalDeductions), net: Number(item.net),
          allowances: item.allowances, deductions: item.deductions, ...e,
        })),
      },
    });
  } catch (err) { next(err); }
});

router.post('/runs/:id/finalize', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.schoolId, schoolId))).limit(1);
    if (!run) throw ApiError.notFound('Payroll run not found');
    if (run.status !== 'draft') throw ApiError.badRequest(`Run is already ${run.status}`);
    const [row] = await db.update(payrollRuns).set({ status: 'finalized', finalizedAt: new Date() }).where(eq(payrollRuns.id, run.id)).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'finalize_payroll', entity: 'payroll_run', entityId: run.id, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

/** Mark the run as paid and post the salary expense. */
router.post('/runs/:id/pay', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.schoolId, schoolId))).limit(1);
    if (!run) throw ApiError.notFound('Payroll run not found');
    if (run.status === 'paid') throw ApiError.badRequest('Run already paid');

    const items = await db.select().from(payrollItems).where(eq(payrollItems.runId, run.id));
    await db.update(payrollItems).set({ status: 'paid', paidAt: new Date() }).where(eq(payrollItems.runId, run.id));

    const [salaryHead] = await db.select().from(accountHeads)
      .where(and(eq(accountHeads.schoolId, schoolId), eq(accountHeads.group, 'salary'))).limit(1);
    if (salaryHead && Number(run.totalNet) > 0) {
      await db.insert(transactions).values({
        schoolId, txnDate: new Date().toISOString().slice(0, 10), headId: salaryHead.id,
        type: 'expense', amount: String(run.totalNet ?? 0), mode: 'bank', category: 'salary',
        description: `Salary payment — ${run.label ?? `${run.month}/${run.year}`}`,
        reference: `PAYROLL-${run.id.slice(0, 8)}`, createdBy: req.auth!.id,
      });
    }
    const [row] = await db.update(payrollRuns).set({ status: 'paid' }).where(eq(payrollRuns.id, run.id)).returning();
    await audit(db, { schoolId, userId: req.auth!.id, action: 'pay_payroll', entity: 'payroll_run', entityId: run.id, detail: { items: items.length, total: run.totalNet }, ip: req.ip });
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/runs/:id', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.schoolId, req.auth!.schoolId!))).limit(1);
    if (!run) throw ApiError.notFound('Payroll run not found');
    if (run.status === 'paid') throw ApiError.badRequest('A paid payroll run cannot be deleted');
    await db.delete(payrollItems).where(eq(payrollItems.runId, run.id));
    await db.delete(payrollRuns).where(eq(payrollRuns.id, run.id));
    res.json({ ok: true, data: { id: run.id, deleted: true } });
  } catch (err) { next(err); }
});

/** Salary slip for one employee in a run (print view data). */
router.get('/runs/:id/slip/:employeeId', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.schoolId, schoolId))).limit(1);
    if (!run) throw ApiError.notFound('Payroll run not found');
    const [item] = await db.select().from(payrollItems)
      .where(and(eq(payrollItems.runId, run.id), eq(payrollItems.employeeId, req.params.employeeId))).limit(1);
    if (!item) throw ApiError.notFound('Salary item not found');
    const [emp] = await db.select().from(employees).where(eq(employees.id, req.params.employeeId)).limit(1);
    const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
    res.json({
      ok: true,
      data: {
        run: { month: run.month, year: run.year, label: run.label, status: run.status },
        employee: emp ? { id: emp.id, nameEn: emp.nameEn, nameNe: emp.nameNe, empCode: emp.empCode, designation: emp.designation, appointmentType: emp.appointmentType, bankName: emp.bankName, bankAccount: emp.bankAccount } : null,
        salary: {
          basic: Number(item.basic),
          allowances: item.allowances, deductions: item.deductions,
          gross: Number(item.gross), totalDeductions: Number(item.totalDeductions), net: Number(item.net),
        },
        school,
      },
    });
  } catch (err) { next(err); }
});

/** Bank payment sheet (export). */
router.get('/runs/:id/bank-sheet', requireRole(...FINANCE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, req.params.id), eq(payrollRuns.schoolId, req.auth!.schoolId!))).limit(1);
    if (!run) throw ApiError.notFound('Payroll run not found');
    const rows = await db
      .select({ empCode: employees.empCode, nameEn: employees.nameEn, bankName: employees.bankName, bankAccount: employees.bankAccount, net: payrollItems.net, status: payrollItems.status })
      .from(payrollItems)
      .leftJoin(employees, eq(employees.id, payrollItems.employeeId))
      .where(eq(payrollItems.runId, run.id))
      .orderBy(asc(employees.nameEn));
    const cols: ExportColumn[] = [
      { key: 'empCode', header: 'Employee Code' }, { key: 'nameEn', header: 'Name' },
      { key: 'bankName', header: 'Bank' }, { key: 'bankAccount', header: 'Account No' },
      { key: 'net', header: 'Net Salary (NPR)' }, { key: 'status', header: 'Status' },
    ];
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="bank-payment-sheet.csv"');
      return res.send(toCsv(rows, cols));
    }
    const buf = await toXlsx(rows, cols, 'Bank Sheet');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bank-payment-sheet.xlsx"');
    res.send(buf);
  } catch (err) { next(err); }
});

export default router;
