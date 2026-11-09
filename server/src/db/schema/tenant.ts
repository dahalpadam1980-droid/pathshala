import { pgTable, uuid, text, timestamp, boolean, jsonb, date, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** Multi-tenant root: every school (tenant) in the platform. */
export const schools = pgTable(
  'schools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(), // used for public portal URL + login
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    type: text('type').notNull().default('private'), // private | community | public
    levels: jsonb('levels').$type<string[]>().default(['ecd', 'basic', 'secondary']),
    logoUrl: text('logo_url'),
    stampUrl: text('stamp_url'),
    address: text('address'),
    municipality: text('municipality'),
    ward: integer('ward'),
    district: text('district'),
    province: text('province'),
    registrationNo: text('registration_no'),
    emisCode: text('emis_code'),
    phone: text('phone'),
    altPhone: text('alt_phone'),
    email: text('email'),
    website: text('website'),
    social: jsonb('social').$type<Record<string, string>>().default({}),
    principalName: text('principal_name'),
    principalPhone: text('principal_phone'),
    establishedDate: date('established_date'),
    mottoEn: text('motto_en'),
    mottoNe: text('motto_ne'),
    branding: jsonb('branding')
      .$type<{ primary?: string; secondary?: string; accent?: string }>()
      .default({}),
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
    status: text('status').notNull().default('active'), // active | trial | suspended
    plan: text('plan').notNull().default('standard'), // standard | basic | premium
    trialEndsAt: timestamp('trial_ends_at'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('schools_status_idx').on(t.status)],
);

/** Academic years in both BS and AD. */
export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    name: text('name').notNull(), // e.g. "2082/83"
    startBs: text('start_bs').notNull(), // YYYY-MM-DD in Bikram Sambat
    endBs: text('end_bs').notNull(),
    startAd: date('start_ad').notNull(),
    endAd: date('end_ad').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    status: text('status').notNull().default('active'), // active | archived
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('academic_years_school_idx').on(t.schoolId)],
);

/** Key/value school-specific configuration (feature toggles, defaults). */
export const schoolSettings = pgTable(
  'school_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('school_settings_key_uq').on(t.schoolId, t.key)],
);

/** Uploaded files (photos, documents, templates). */
export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id'), // null = platform-level file
    filename: text('filename').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    path: text('path').notNull(),
    ownerId: uuid('owner_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('uploads_school_idx').on(t.schoolId)],
);

/** Immutable audit trail for sensitive operations. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id'),
    userId: uuid('user_id'),
    action: text('action').notNull(), // create | update | delete | login | approve | lock ...
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    ip: text('ip'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('audit_school_idx').on(t.schoolId), index('audit_created_idx').on(t.createdAt)],
);
