import { pgTable, uuid, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';

/**
 * Users. The `role` drives RBAC.
 * super_admin has schoolId = null (platform scope); every other role belongs to exactly one school.
 * Roles: super_admin | school_admin | accountant | office | teacher | student | parent
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id'), // null => platform super admin
    role: text('role').notNull().default('teacher'),
    username: text('username').notNull().unique(),
    email: text('email'),
    phone: text('phone'),
    passwordHash: text('password_hash').notNull(),
    nameEn: text('name_en').notNull(),
    nameNe: text('name_ne'),
    photoUrl: text('photo_url'),
    locale: text('locale').notNull().default('en'), // en | ne
    status: text('status').notNull().default('active'), // active | inactive | locked
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    lastLoginAt: timestamp('last_login_at'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('users_school_idx').on(t.schoolId), index('users_role_idx').on(t.role)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('refresh_user_idx').on(t.userId)],
);

export const loginHistory = pgTable(
  'login_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    schoolId: uuid('school_id'),
    success: boolean('success').notNull(),
    reason: text('reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('login_user_idx').on(t.userId)],
);
