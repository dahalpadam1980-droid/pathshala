import { Router } from 'express';
import { count, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  academicYears, schoolSettings, schools, users, students, classes,
} from '../../db/schema/index.js';
import { authenticate, requireRole, requireSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { ApiError } from '../../lib/errors.js';
import { adToBs, bsToAd } from '../../lib/bsdate.js';
import { config } from '../../config.js';

const router = Router();
router.use(authenticate, requireSchool);

/** GET /settings/academic-years */
router.get('/academic-years', async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const rows = await db
    .select()
    .from(academicYears)
    .where(eq(academicYears.schoolId, schoolId))
    .orderBy(sql`${academicYears.startAd} desc`);
  res.json({ ok: true, data: rows });
});

const yearSchema = z.object({
  name: z.string().min(2).max(60),
  startAd: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date'),
  endAd: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date'),
  isCurrent: z.boolean().optional(),
});

router.post('/academic-years', validateBody(yearSchema), async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const { name, startAd, endAd, isCurrent } = req.body as z.infer<typeof yearSchema>;
  if (isCurrent) {
    await db.update(academicYears).set({ isCurrent: false }).where(eq(academicYears.schoolId, schoolId));
  }
  const [row] = await db
    .insert(academicYears)
    .values({ schoolId, name, startAd, endAd, startBs: adToBs(startAd), endBs: adToBs(endAd), isCurrent: isCurrent ?? false })
    .returning();
  res.json({ ok: true, data: row });
});

/** GET /settings — school settings (key/value) */
router.get('/', async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const rows = await db.select().from(schoolSettings).where(eq(schoolSettings.schoolId, schoolId));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = String(r.value ?? ''); // legacy rows may hold numbers/booleans
  const school = (await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1))[0];
  res.json({ ok: true, data: { settings: map, school } });
});

const settingsSchema = z.object({
  // Coerce: legacy rows and numeric/checkbox form values are stored as strings.
  settings: z.record(z.string(), z.coerce.string().max(1000)),
});

/** PATCH /settings — upsert multiple keys */
router.patch('/', requireRole('school_admin', 'super_admin', 'office'), validateBody(settingsSchema), async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const entries = Object.entries(req.body.settings as Record<string, string>);
  for (const [key, value] of entries) {
    await db
      .insert(schoolSettings)
      .values({ schoolId, key, value })
      .onConflictDoUpdate({ target: [schoolSettings.schoolId, schoolSettings.key], set: { value, updatedAt: new Date() } });
  }
  const rows = await db.select().from(schoolSettings).where(eq(schoolSettings.schoolId, schoolId));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = String(r.value ?? ''); // legacy rows may hold numbers/booleans
  res.json({ ok: true, data: map });
});

/** GET /settings/dates/today?calendar=bs|ad — server-truth date conversion */
router.get('/dates/today', (req, res) => {
  const calendar = req.query.calendar === 'bs' ? 'bs' : 'ad';
  const now = new Date();
  res.json({
    ok: true,
    data: {
      ad: now.toISOString().slice(0, 10),
      bs: adToBs(now),
      calendar,
    },
  });
});

router.post('/dates/convert', validateBody(z.object({ date: z.string().min(8), direction: z.enum(['toBs', 'toAd']) })), (req, res) => {
  const { date, direction } = req.body as { date: string; direction: 'toBs' | 'toAd' };
  try {
    const result = direction === 'toBs' ? adToBs(new Date(date)) : bsToAd(date).toISOString().slice(0, 10);
    res.json({ ok: true, data: { result } });
  } catch {
    throw ApiError.badRequest('Invalid date for conversion');
  }
});

/** GET /settings/stats — counts used by the settings UI */
router.get('/stats', async (req, res) => {
  const schoolId = req.auth!.schoolId!;
  const [y] = await db.select({ value: count() }).from(academicYears).where(eq(academicYears.schoolId, schoolId));
  const [s] = await db.select({ value: count() }).from(students).where(eq(students.schoolId, schoolId));
  const [c] = await db.select({ value: count() }).from(classes).where(eq(classes.schoolId, schoolId));
  const [u] = await db.select({ value: count() }).from(users).where(eq(users.schoolId, schoolId));
  res.json({ ok: true, data: { academicYears: y?.value ?? 0, students: s?.value ?? 0, classes: c?.value ?? 0, users: u?.value ?? 0, storage: config.uploadDir } });
});

export default router;
