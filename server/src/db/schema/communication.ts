import { pgTable, uuid, text, timestamp, boolean, jsonb, date, index } from 'drizzle-orm/pg-core';

/** Notices & circulars with audience targeting. */
export const notices = pgTable(
  'notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    titleEn: text('title_en').notNull(),
    titleNe: text('title_ne'),
    bodyEn: text('body_en').notNull(),
    bodyNe: text('body_ne'),
    audience: jsonb('audience')
      .$type<{ all?: boolean; roles?: string[]; classIds?: string[]; sectionIds?: string[] }>()
      .default({ all: false, roles: [], classIds: [] }),
    attachments: jsonb('attachments').$type<{ name: string; url: string }[]>().default([]),
    priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
    pinned: boolean('pinned').notNull().default(false),
    status: text('status').notNull().default('published'), // draft | published | archived
    publishedAt: timestamp('published_at'),
    authorId: uuid('author_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('notices_school_idx').on(t.schoolId, t.status)],
);

/** Notification delivery history (in-app / SMS / email / push). */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    userId: uuid('user_id'),
    channel: text('channel').notNull().default('inapp'), // inapp | sms | email | push
    title: text('title').notNull(),
    body: text('body'),
    status: text('status').notNull().default('pending'), // pending | sent | failed
    error: text('error'),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
    sentAt: timestamp('sent_at'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('notifications_school_idx').on(t.schoolId, t.status)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    subject: text('subject'),
    type: text('type').notNull().default('direct'), // direct | group | teacher_parent
    participantIds: jsonb('participant_ids').$type<string[]>().default([]),
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('conversations_school_idx').on(t.schoolId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull(),
    senderId: uuid('sender_id').notNull(),
    body: text('body').notNull(),
    attachments: jsonb('attachments').$type<{ name: string; url: string }[]>().default([]),
    readBy: jsonb('read_by').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('messages_conv_idx').on(t.conversationId, t.createdAt)],
);
