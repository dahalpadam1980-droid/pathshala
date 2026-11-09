import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** Public website pages per school (portal content). */
export const sitePages = pgTable(
  'site_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    slug: text('slug').notNull(),
    template: text('template').default('custom'),
    // home | about | principal_message | history | mission | facilities | admission |
    // teachers | academics | notices | gallery | downloads | contact | custom
    titleEn: text('title_en').notNull(),
    titleNe: text('title_ne'),
    bodyEn: text('body_en'),
    bodyNe: text('body_ne'),
    heroImageUrl: text('hero_image_url'),
    published: boolean('published').notNull().default(true),
    orderIndex: integer('order_index').notNull().default(0),
    seoDescription: text('seo_description'),
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('site_pages_uq').on(t.schoolId, t.slug)],
);

export const galleryItems = pgTable(
  'gallery_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    title: text('title'),
    url: text('url').notNull(),
    type: text('type').notNull().default('image'), // image | video
    published: boolean('published').notNull().default(true),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('gallery_school_idx').on(t.schoolId)],
);
