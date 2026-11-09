import { pgTable, uuid, text, timestamp, integer, numeric, boolean, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    plateNo: text('plate_no').notNull(),
    type: text('type').default('bus'), // bus | van | car | micro
    model: text('model'),
    capacity: integer('capacity'),
    insuranceExpiry: date('insurance_expiry'),
    fitnessExpiry: date('fitness_expiry'),
    status: text('status').notNull().default('active'), // active | maintenance | inactive
    driverName: text('driver_name'),
    driverPhone: text('driver_phone'),
    helperName: text('helper_name'),
    helperPhone: text('helper_phone'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('vehicles_plate_uq').on(t.schoolId, t.plateNo)],
);

export const transportRoutes = pgTable(
  'transport_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    vehicleId: uuid('vehicle_id'),
    stops: jsonb('stops').$type<{ name: string; time: string; fare: number }[]>().default([]),
    monthlyFare: numeric('monthly_fare', { precision: 10, scale: 2 }).default('0'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('transport_routes_idx').on(t.schoolId)],
);

export const transportAllocations = pgTable(
  'transport_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    routeId: uuid('route_id').notNull(),
    studentId: uuid('student_id').notNull(),
    stopName: text('stop_name'),
    monthlyFare: numeric('monthly_fare', { precision: 10, scale: 2 }).default('0'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('transport_alloc_uq').on(t.routeId, t.studentId)],
);

export const vehicleExpenses = pgTable(
  'vehicle_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    date: date('date').notNull(),
    type: text('type').notNull().default('fuel'), // fuel | maintenance | insurance | tax | other
    description: text('description'),
    liters: numeric('liters', { precision: 8, scale: 2 }),
    odometer: integer('odometer'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
    vendor: text('vendor'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('vehicle_expenses_idx').on(t.vehicleId, t.date)],
);
