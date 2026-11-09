import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { notices, notifications, conversations, messages, students, users, classes as classTable, sections } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { authenticate, requireRole, requireSchool, requireActiveSchool } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { audit } from '../../lib/audit.js';

const router = Router();
router.use(authenticate, requireSchool, requireActiveSchool);

const ALL_ROLES = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'] as const;
const PUBLISH = ['super_admin', 'school_admin', 'office'] as const;

/** Audience targeting helper: which user ids receive a notice. */
async function resolveAudience(schoolId: string, audience: { all?: boolean; roles?: string[]; classIds?: string[]; sectionIds?: string[] }): Promise<string[]> {
  const db = await getDb();
  if (audience.all) {
    const rows = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.schoolId, schoolId), eq(users.status, 'active')));
    return rows.map((r) => r.id);
  }
  const filters: any[] = [eq(users.schoolId, schoolId), eq(users.status, 'active')];
  if (audience.roles?.length) filters.push(sql`${users.role} in (${sql.join(audience.roles.map((r) => sql`${r}`), sql`, `)})`);
  let userRows = await db.select({ id: users.id, role: users.role }).from(users).where(and(...filters));

  if (audience.classIds?.length || audience.sectionIds?.length) {
    const sf: any[] = [eq(students.schoolId, schoolId)];
    if (audience.classIds?.length) sf.push(sql`${students.classId} in (${sql.join(audience.classIds.map((c) => sql`${c}`), sql`, `)})`);
    if (audience.sectionIds?.length) sf.push(sql`${students.sectionId} in (${sql.join(audience.sectionIds.map((c) => sql`${c}`), sql`, `)})`);
    const stuRows = await db.select({ userId: students.userId }).from(students).where(and(...sf));
    const studentUserIds = new Set(stuRows.filter((s) => s.userId).map((s) => s.userId!));
    userRows = userRows.filter((u) => u.role === 'student' ? studentUserIds.has(u.id) : true);
    // parents of those students
    if (audience.classIds?.length || audience.sectionIds?.length) {
      const parentIds = new Set<string>();
      for (const s of stuRows) {
        if (!s.userId) continue;
        const [st] = await db.select({ fatherPhone: students.fatherPhone, guardianPhone: students.guardianPhone }).from(students).where(eq(students.userId, s.userId)).limit(1);
        void st;
      }
      const parentUsers = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.schoolId, schoolId), eq(users.role, 'parent'), eq(users.status, 'active')));
      for (const p of parentUsers) parentIds.add(p.id);
      return [...new Set([...userRows.map((u) => u.id), ...parentIds])];
    }
  }
  return userRows.map((u) => u.id);
}

// ================= Notices =================
router.get('/notices', requireRole(...ALL_ROLES), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const filters: any[] = [eq(notices.schoolId, schoolId), eq(notices.status, 'published')];
    if (req.query.status === 'draft' || req.query.status === 'archived') {
      filters.length = 0;
      filters.push(eq(notices.schoolId, schoolId), eq(notices.status, String(req.query.status)));
    }
    if (req.query.priority) filters.push(eq(notices.priority, String(req.query.priority)));
    if (req.query.q) filters.push(sql`(${notices.titleEn} ILIKE ${'%' + req.query.q + '%'} OR ${notices.titleNe} ILIKE ${'%' + req.query.q + '%'} OR ${notices.bodyEn} ILIKE ${'%' + req.query.q + '%'})`);

    const rows = await db
      .select({
        id: notices.id, titleEn: notices.titleEn, titleNe: notices.titleNe, bodyEn: notices.bodyEn, bodyNe: notices.bodyNe,
        audience: notices.audience, attachments: notices.attachments, priority: notices.priority,
        pinned: notices.pinned, status: notices.status, publishedAt: notices.publishedAt, createdAt: notices.createdAt,
        authorName: users.nameEn,
      })
      .from(notices)
      .leftJoin(users, eq(users.id, notices.authorId))
      .where(and(...filters))
      .orderBy(desc(notices.pinned), desc(notices.publishedAt ?? notices.createdAt)).limit(200);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

const noticeSchema = z.object({
  titleEn: z.string().min(1).max(300),
  titleNe: z.string().max(300).optional().nullable(),
  bodyEn: z.string().min(1).max(20000),
  bodyNe: z.string().max(20000).optional().nullable(),
  audience: z.object({
    all: z.boolean().default(false),
    roles: z.array(z.string()).default([]),
    classIds: z.array(z.string().uuid()).default([]),
    sectionIds: z.array(z.string().uuid()).default([]),
  }).default({ all: false, roles: [], classIds: [], sectionIds: [] }),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })).default([]),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  pinned: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
  notifyRoles: z.array(z.string()).default([]), // also send in-app notifications to these roles
});

router.post('/notices', requireRole(...PUBLISH), validateBody(noticeSchema), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const { notifyRoles, ...body } = req.body; // notifyRoles is virtual (drives notifications, not a column)
    const [row] = await db.insert(notices).values({
      ...body, schoolId, authorId: req.auth!.id,
      publishedAt: body.status === 'published' ? new Date() : null,
    }).returning();

    let notified = 0;
    if (body.status === 'published' && notifyRoles?.length) {
      const targets = await resolveAudience(schoolId, { roles: notifyRoles });
      if (targets.length) {
        await db.insert(notifications).values(targets.slice(0, 1000).map((uid) => ({
          schoolId, userId: uid, channel: 'inapp', title: body.titleEn,
          body: (body.bodyEn ?? '').slice(0, 300), status: 'sent', sentAt: new Date(), createdBy: req.auth!.id,
        })));
        notified = targets.length;
      }
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'create', entity: 'notice', entityId: row.id, detail: { title: row.titleEn, status: row.status, notified }, ip: req.ip });
    res.status(201).json({ ok: true, data: { ...row, notified } });
  } catch (err) { next(err); }
});

router.patch('/notices/:id', requireRole(...PUBLISH), validateBody(noticeSchema.partial()), async (req, res, next) => {
  try {
    const db = await getDb();
    const body: any = { ...req.body, updatedAt: new Date() };
    if (body.status === 'published' && body.publishedAt === undefined) body.publishedAt = new Date();
    delete body.audience; // audience is stored as jsonb but PATCH updates it via dedicated field handling
    delete body.notifyRoles; // virtual field — not a column
    const [row] = await db.update(notices).set(body)
      .where(and(eq(notices.id, req.params.id), eq(notices.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Notice not found');
    res.json({ ok: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/notices/:id', requireRole(...PUBLISH), async (req, res, next) => {
  try {
    const db = await getDb();
    const [row] = await db.delete(notices)
      .where(and(eq(notices.id, req.params.id), eq(notices.schoolId, req.auth!.schoolId!))).returning();
    if (!row) throw ApiError.notFound('Notice not found');
    await audit(db, { schoolId: req.auth!.schoolId, userId: req.auth!.id, action: 'delete', entity: 'notice', entityId: row.id, ip: req.ip });
    res.json({ ok: true, data: { id: row.id, deleted: true } });
  } catch (err) { next(err); }
});

// ================= Notifications (delivery history + in-app inbox) =================
router.get('/notifications', requireRole(...ALL_ROLES), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    // school-wide history for admins; own inbox for others
    const isAdmin = ['super_admin', 'school_admin', 'office'].includes(req.auth!.role);
    const filters: any[] = [eq(notifications.schoolId, schoolId)];
    if (!isAdmin) filters.push(eq(notifications.userId, req.auth!.id));
    if (req.query.channel) filters.push(eq(notifications.channel, String(req.query.channel)));
    if (req.query.status) filters.push(eq(notifications.status, String(req.query.status)));
    const rows = await db
      .select({
        id: notifications.id,
        channel: notifications.channel,
        title: notifications.title,
        body: notifications.body,
        status: notifications.status,
        error: notifications.error,
        meta: notifications.meta,
        sentAt: notifications.sentAt,
        createdAt: notifications.createdAt,
        recipientName: users.nameEn,
        recipientRole: users.role,
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.userId))
      .where(and(...filters))
      .orderBy(desc(notifications.createdAt)).limit(300);
    const [summary] = await db.select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${notifications.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${notifications.status} = 'failed')::int`,
      pending: sql<number>`count(*) filter (where ${notifications.status} = 'pending')::int`,
    }).from(notifications).where(eq(notifications.schoolId, schoolId));
    res.json({ ok: true, data: rows, meta: summary });
  } catch (err) { next(err); }
});

/** Targeted broadcast: pick audience, choose channels, queue messages. */
router.post('/broadcast', requireRole(...PUBLISH), validateBody(z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  channels: z.array(z.enum(['inapp', 'sms', 'email', 'push'])).min(1),
  audience: z.object({
    all: z.boolean().default(false),
    roles: z.array(z.string()).default([]),
    classIds: z.array(z.string().uuid()).default([]),
    sectionIds: z.array(z.string().uuid()).default([]),
  }),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const targetIds = await resolveAudience(schoolId, req.body.audience);
    if (!targetIds.length) throw ApiError.badRequest('No recipients matched the selected audience');

    const targetUsers = await db.select().from(users).where(sql`${users.id} in (${sql.join(targetIds.map((i) => sql`${i}`), sql`, `)})`);
    let queued = 0;
    for (const channel of req.body.channels) {
      for (const u of targetUsers.slice(0, 2000)) {
        const phone = u.phone;
        if (channel === 'sms' && !phone) continue;
        await db.insert(notifications).values({
          schoolId, userId: u.id, channel, title: req.body.title, body: req.body.body,
          status: channel === 'inapp' ? 'sent' : process.env.SMS_API_URL ? 'pending' : 'failed',
          sentAt: channel === 'inapp' ? new Date() : null,
          error: channel !== 'inapp' && !process.env.SMS_API_URL ? 'Gateway not configured' : null,
          meta: channel === 'sms' ? { phone } : {},
          createdBy: req.auth!.id,
        });
        queued++;
      }
    }
    await audit(db, { schoolId, userId: req.auth!.id, action: 'broadcast', entity: 'notification', detail: { title: req.body.title, queued, channels: req.body.channels }, ip: req.ip });
    res.json({ ok: true, data: { queued, recipients: targetUsers.length } });
  } catch (err) { next(err); }
});

router.post('/notifications/:id/read', requireRole(...ALL_ROLES), async (req, res, next) => {
  try {
    const db = await getDb();
    await db.update(notifications).set({ status: 'sent', sentAt: new Date() })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.auth!.id)));
    res.json({ ok: true, data: { read: true } });
  } catch (err) { next(err); }
});

// ================= Messages (teacher–parent & staff communication) =================
router.get('/conversations', requireRole(...ALL_ROLES), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(conversations)
      .where(and(eq(conversations.schoolId, req.auth!.schoolId!), sql`${conversations.participantIds} ? ${req.auth!.id}`))
      .orderBy(desc(conversations.updatedAt)).limit(100);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/conversations', requireRole(...ALL_ROLES), validateBody(z.object({
  participantIds: z.array(z.string().uuid()).min(1).max(50),
  subject: z.string().max(200).optional().nullable(),
  firstMessage: z.string().min(1).max(5000),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const participants = [...new Set([req.auth!.id, ...req.body.participantIds])];
    const [conv] = await db.insert(conversations).values({
      schoolId, subject: req.body.subject ?? null, participantIds: participants,
      createdById: req.auth!.id,
    }).returning();
    await db.insert(messages).values({ conversationId: conv.id, senderId: req.auth!.id, body: req.body.firstMessage });
    res.status(201).json({ ok: true, data: conv });
  } catch (err) { next(err); }
});

router.get('/conversations/:id/messages', requireRole(...ALL_ROLES), async (req, res, next) => {
  try {
    const db = await getDb();
    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, req.params.id), eq(conversations.schoolId, req.auth!.schoolId!))).limit(1);
    if (!conv) throw ApiError.notFound('Conversation not found');
    if (!(conv.participantIds ?? []).includes(req.auth!.id) && req.auth!.role !== 'school_admin') throw ApiError.forbidden('Not a participant');
    const rows = await db.select({
      id: messages.id, body: messages.body, senderId: messages.senderId,
      createdAt: messages.createdAt, senderName: users.nameEn, senderRole: users.role,
    }).from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(eq(messages.conversationId, conv.id))
      .orderBy(asc(messages.createdAt)).limit(500);
    res.json({ ok: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/conversations/:id/messages', requireRole(...ALL_ROLES), validateBody(z.object({
  body: z.string().min(1).max(5000),
})), async (req, res, next) => {
  try {
    const db = await getDb();
    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, req.params.id), eq(conversations.schoolId, req.auth!.schoolId!))).limit(1);
    if (!conv) throw ApiError.notFound('Conversation not found');
    if (!(conv.participantIds ?? []).includes(req.auth!.id) && req.auth!.role !== 'school_admin') throw ApiError.forbidden('Not a participant');
    const [row] = await db.insert(messages).values({
      conversationId: conv.id, senderId: req.auth!.id, body: req.body.body,
    }).returning();
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conv.id));
    res.status(201).json({ ok: true, data: row });
  } catch (err) { next(err); }
});

/** Quick directory for composing messages: teachers, staff, parents of a class. */
router.get('/directory', requireRole(...ALL_ROLES), async (req, res, next) => {
  try {
    const db = await getDb();
    const schoolId = req.auth!.schoolId!;
    const role = String(req.query.role ?? 'teacher');
    const rows = await db.select({ id: users.id, nameEn: users.nameEn, nameNe: users.nameNe, role: users.role, photoUrl: users.photoUrl })
      .from(users).where(and(eq(users.schoolId, schoolId), eq(users.role, role), eq(users.status, 'active'))).limit(300);
    let classRows: any[] = [];
    if (req.query.role === 'parent') {
      classRows = await db.select({ id: classTable.id, name: classTable.name }).from(classTable).where(eq(classTable.schoolId, schoolId)).orderBy(asc(classTable.orderIndex));
    }
    res.json({ ok: true, data: rows, classes: classRows });
  } catch (err) { next(err); }
});

export default router;
