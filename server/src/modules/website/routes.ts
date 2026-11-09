import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { sitePages, galleryItems, schools, notices, notices as noticeTable } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();

/** Public: fetch a school's website content (no auth). */
router.get('/public/:code', async (req, res, next) => {
  try {
    const db = await getDb();
    const [school] = await db.select().from(schools).where(eq(schools.code, req.params.code)).limit(1);
    if (!school) throw ApiError.notFound('School not found');
    const pages = await db.select().from(sitePages)
      .where(and(eq(sitePages.schoolId, school.id), eq(sitePages.published, true)))
      .orderBy(asc(sitePages.orderIndex));
    const gallery = await db.select().from(galleryItems)
      .where(and(eq(galleryItems.schoolId, school.id), eq(galleryItems.published, true)))
      .orderBy(asc(galleryItems.orderIndex)).limit(100);
    const noticeRows = await db.select({
      id: noticeTable.id, titleEn: noticeTable.titleEn, titleNe: noticeTable.titleNe,
      bodyEn: noticeTable.bodyEn, priority: noticeTable.priority, publishedAt: noticeTable.publishedAt,
    }).from(noticeTable)
      .where(and(eq(noticeTable.schoolId, school.id), eq(noticeTable.status, 'published')))
      .orderBy(noticeTable.publishedAt).limit(20);
    const { settings, ...safeSchool } = school;
    void settings;
    res.json({ ok: true, data: { school: safeSchool, pages, gallery, notices: noticeRows } });
  } catch (err) { next(err); }
});

// Authenticated management
router.use(authenticate, requireSchool, requireActiveSchool);

const ALL = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher'] as const;
const MANAGE = ['super_admin', 'school_admin', 'office'] as const;

router.get('/pages', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(sitePages)
      .where(eq(sitePages.schoolId, req.auth!.schoolId!)).orderBy(asc(sitePages.orderIndex));
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/pages', requireRole(...MANAGE), validateBody(z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, 'Slug may contain lowercase letters, numbers and hyphens'),
  template: z.string().max(60).default('custom'),
  titleEn: z.string().min(1).max(200),
  titleNe: z.string().max(200).optional().nullable(),
  bodyEn: z.string().max(50000).optional().nullable(),
  bodyNe: z.string().max(50000).optional().nullable(),
  heroImageUrl: z.string().max(1000).optional().nullable(),
  published: z.boolean().default(true),
  orderIndex: z.number().int().default(0),
  seoDescription: z.string().max(300).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [dupe] = await db.select({ id: sitePages.id }).from(sitePages)
      .where(and(eq(sitePages.schoolId, req.auth!.schoolId!), eq(sitePages.slug, req.body.slug))).limit(1);
    if (dupe) throw ApiError.conflict('A page with this slug already exists');
    const [row] = await db.insert(sitePages).values({ ...req.body, schoolId: req.auth!.schoolId!, updatedBy: req.auth!.id }).returning();
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'create', entity: 'site_page', entityId: row.id, detail: { slug: row.slug }, ip: req.ip });
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.patch('/pages/:id', requireRole(...MANAGE), validateBody(z.object({
  titleEn: z.string().min(1).max(200).optional(),
  titleNe: z.string().max(200).optional().nullable(),
  bodyEn: z.string().max(50000).optional().nullable(),
  bodyNe: z.string().max(50000).optional().nullable(),
  heroImageUrl: z.string().max(1000).optional().nullable(),
  published: z.boolean().optional(),
  orderIndex: z.number().int().optional(),
  seoDescription: z.string().max(300).optional().nullable(),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.update(sitePages).set({ ...req.body, updatedBy: req.auth!.id, updatedAt: new Date() })
      .where(and(eq(sitePages.id, req.params.id), eq(sitePages.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Page not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/pages/:id', requireRole(...MANAGE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(sitePages)
      .where(and(eq(sitePages.id, req.params.id), eq(sitePages.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Page not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

router.get('/gallery', requireRole(...ALL), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(galleryItems)
      .where(eq(galleryItems.schoolId, req.auth!.schoolId!)).orderBy(asc(galleryItems.orderIndex)).limit(300);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/gallery', requireRole(...MANAGE), validateBody(z.object({
  title: z.string().max(200).optional().nullable(),
  url: z.string().min(1).max(1000),
  type: z.enum(['image', 'video']).default('image'),
  published: z.boolean().default(true),
  orderIndex: z.number().int().default(0),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(galleryItems).values({ ...req.body, schoolId: req.auth!.schoolId! }).returning();
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/gallery/:id', requireRole(...MANAGE), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(galleryItems)
      .where(and(eq(galleryItems.id, req.params.id), eq(galleryItems.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Gallery item not found');
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

export default router;
