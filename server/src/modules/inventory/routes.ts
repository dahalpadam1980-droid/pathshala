import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { assets, assetMovements } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const READ = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher'] as const;
const WRITE = ['super_admin', 'school_admin', 'office'] as const;

const CATEGORIES = ['furniture', 'computer', 'projector', 'laboratory', 'sports', 'library', 'teaching_material', 'office', 'vehicle', 'building', 'other'] as const;

router.get('/', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const filters: any[] = [eq(assets.schoolId, req.auth!.schoolId!)];
    if (req.query.category) filters.push(eq(assets.category, String(req.query.category)));
    if (req.query.condition) filters.push(eq(assets.condition, String(req.query.condition)));
    if (req.query.q) filters.push(sql`(${assets.name} ILIKE ${'%' + req.query.q + '%'} OR ${assets.code} ILIKE ${'%' + req.query.q + '%'} OR ${assets.supplier} ILIKE ${'%' + req.query.q + '%'})`);
    const rows = await db.select().from(assets).where(and(...filters)).orderBy(asc(assets.name)).limit(500);
    const [summary] = await db.select({
      items: sql<number>`count(*)::int`,
      units: sql<number>`coalesce(sum(${assets.quantity}), 0)::int`,
      value: sql<number>`coalesce(sum(${assets.purchaseCost} * ${assets.quantity}), 0)::float`,
      damaged: sql<number>`count(*) filter (where ${assets.condition} = 'damaged' or ${assets.condition} = 'lost')::int`,
    }).from(assets).where(eq(assets.schoolId, req.auth!.schoolId!));
    res.json({ ok: true, data: rows.map((r) => ({ ...r, purchaseCost: Number(r.purchaseCost) })), meta: summary });
  } catch (err) { next(err); }
});

router.post('/', requireRole(...WRITE), validateBody(z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  category: z.enum(CATEGORIES).default('other'),
  quantity: z.number().int().min(1).max(100000).default(1),
  unit: z.string().max(20).default('pcs'),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  purchaseCost: z.number().min(0).max(1000000000).default(0),
  supplier: z.string().max(200).optional().nullable(),
  warrantyUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  condition: z.enum(['good', 'fair', 'damaged', 'lost']).default('good'),
  location: z.string().max(200).optional().nullable(),
  assignedTo: z.string().max(200).optional().nullable(),
  depreciationRate: z.number().min(0).max(100).default(0),
  notes: z.string().max(2000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [dupe] = await db.select({ id: assets.id }).from(assets)
      .where(and(eq(assets.schoolId, schoolId), eq(assets.code, req.body.code))).limit(1);
    if (dupe) throw ApiError.conflict('Asset code already exists');
    const [row] = await db.insert(assets).values({
      ...req.body, schoolId, purchaseCost: String(req.body.purchaseCost), createdBy: req.auth!.id,
    }).returning();
    if (req.body.purchaseDate) {
      await db.insert(assetMovements).values({
        schoolId, assetId: row.id, date: req.body.purchaseDate, type: 'purchase',
        quantity: row.quantity, party: req.body.supplier ?? null, cost: String(req.body.purchaseCost),
        performedBy: req.auth!.id,
      });
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'asset', entityId: row.id, detail: { code: row.code, name: row.name }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(...WRITE), validateBody(z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  quantity: z.number().int().min(1).max(100000).optional(),
  supplier: z.string().max(200).optional().nullable(),
  warrantyUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  condition: z.enum(['good', 'fair', 'damaged', 'lost']).optional(),
  location: z.string().max(200).optional().nullable(),
  assignedTo: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(assets).set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(assets.id, req.params.id), eq(assets.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Asset not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('super_admin', 'school_admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(assets)
      .where(and(eq(assets.id, req.params.id), eq(assets.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Asset not found');
    await db.delete(assetMovements).where(eq(assetMovements.assetId, row.id));
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'delete', entity: 'asset', entityId: row.id, detail: { code: row.code }, ip: req.ip });
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

router.post('/:id/movements', requireRole(...WRITE), validateBody(z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['purchase', 'distribute', 'return', 'repair', 'transfer', 'dispose', 'lost']),
  quantity: z.number().int().min(1).max(100000).default(1),
  party: z.string().max(200).optional().nullable(),
  cost: z.number().min(0).max(1000000000).default(0),
  remarks: z.string().max(1000).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const [asset] = await db.select().from(assets)
      .where(and(eq(assets.id, req.params.id), eq(assets.schoolId, schoolId))).limit(1);
    if (!asset) throw ApiError.notFound('Asset not found');
    const [row] = await db.insert(assetMovements).values({
      ...req.body, schoolId, assetId: asset.id, cost: String(req.body.cost), performedBy: req.auth!.id,
    }).returning();
    if (['dispose', 'lost'].includes(req.body.type)) {
      await db.update(assets).set({ condition: req.body.type === 'lost' ? 'lost' : 'damaged', updatedAt: new Date() }).where(eq(assets.id, asset.id));
    } else if (req.body.type === 'repair') {
      await db.update(assets).set({ condition: 'good', updatedAt: new Date() }).where(eq(assets.id, asset.id));
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'asset_movement', entity: 'asset', entityId: asset.id, detail: { type: req.body.type, quantity: req.body.quantity }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.get('/:id/movements', requireRole(...READ), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(assetMovements)
      .where(and(eq(assetMovements.assetId, req.params.id), eq(assetMovements.schoolId, req.auth!.schoolId!)))
      .orderBy(desc(assetMovements.date)).limit(200);
    res.json({ ok: true, data: rows.map((r) => ({ ...r, cost: Number(r.cost) })) });
  } catch (err) { next(err); }
});

export default router;
