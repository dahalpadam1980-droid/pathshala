import { pgTable, uuid, text, timestamp, integer, boolean, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const hostels = pgTable(
  'hostels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    name: text('name').notNull(),
    warden: text('warden'),
    capacity: integer('capacity').default(0),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('hostels_school_idx').on(t.schoolId)],
);

export const hostelRooms = pgTable(
  'hostel_rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostelId: uuid('hostel_id').notNull(),
    schoolId: uuid('school_id').notNull(),
    roomNo: text('room_no').notNull(),
    capacity: integer('capacity').notNull().default(4),
    occupied: integer('occupied').notNull().default(0),
    status: text('status').notNull().default('available'), // available | full | maintenance
  },
  (t) => [uniqueIndex('hostel_room_uq').on(t.hostelId, t.roomNo)],
);

export const hostelAllocations = pgTable(
  'hostel_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    roomId: uuid('room_id').notNull(),
    studentId: uuid('student_id').notNull(),
    bedNo: text('bed_no'),
    from: date('from_date'),
    to: date('to_date'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('hostel_alloc_uq').on(t.roomId, t.studentId)],
);

export const hostelComplaints = pgTable(
  'hostel_complaints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    studentId: uuid('student_id'),
    body: text('body').notNull(),
    status: text('status').notNull().default('open'), // open | in_progress | resolved
    resolution: text('resolution'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('hostel_complaints_idx').on(t.schoolId, t.status)],
);
