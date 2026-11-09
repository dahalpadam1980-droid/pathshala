import { pgTable, uuid, text, timestamp, boolean, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** School Management Committee / PTA / TPA. */
export const committees = pgTable(
  'committees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull().default('smc'), // smc | pta | tpa | other
    formedOn: date('formed_on'),
    termEndsOn: date('term_ends_on'),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('committees_school_idx').on(t.schoolId)],
);

export const committeeMembers = pgTable(
  'committee_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    committeeId: uuid('committee_id').notNull(),
    schoolId: uuid('school_id').notNull(),
    name: text('name').notNull(),
    nameNe: text('name_ne'),
    role: text('role').notNull().default('member'), // chair | vice_chair | secretary | treasurer | member
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    occupation: text('occupation'),
    appointedOn: date('appointed_on'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('committee_members_idx').on(t.committeeId)],
);

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    committeeId: uuid('committee_id'),
    title: text('title').notNull(),
    meetingDate: date('meeting_date').notNull(),
    startTime: text('start_time'),
    venue: text('venue'),
    agenda: jsonb('agenda').$type<string[]>().default([]),
    minutes: text('minutes'),
    decisions: jsonb('decisions').$type<{ text: string; owner?: string; dueDate?: string; status?: string }[]>().default([]),
    status: text('status').notNull().default('scheduled'), // scheduled | held | cancelled
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('meetings_school_idx').on(t.schoolId, t.meetingDate)],
);

export const meetingAttendances = pgTable(
  'meeting_attendances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id').notNull(),
    memberId: uuid('member_id').notNull(),
    present: boolean('present').notNull().default(false),
    remarks: text('remarks'),
  },
  (t) => [uniqueIndex('meeting_attendance_uq').on(t.meetingId, t.memberId)],
);
