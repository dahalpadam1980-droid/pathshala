import { pgTable, uuid, text, timestamp, integer, numeric, date, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default('furniture'),
    // furniture | computer | projector | laboratory | sports | library | teaching_material | office | vehicle | building | other
    quantity: integer('quantity').notNull().default(1),
    unit: text('unit').default('pcs'),
    purchaseDate: date('purchase_date'),
    purchaseCost: numeric('purchase_cost', { precision: 14, scale: 2 }).default('0'),
    supplier: text('supplier'),
    warrantyUntil: date('warranty_until'),
    condition: text('condition').notNull().default('good'), // good | fair | damaged | lost
    location: text('location'),
    assignedTo: text('assigned_to'),
    depreciationRate: numeric('depreciation_rate', { precision: 5, scale: 2 }).default('0'),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('assets_code_uq').on(t.schoolId, t.code),
    index('assets_category_idx').on(t.schoolId, t.category),
  ],
);

export const assetMovements = pgTable(
  'asset_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull(),
    assetId: uuid('asset_id').notNull(),
    date: date('date').notNull(),
    type: text('type').notNull(), // purchase | distribute | return | repair | transfer | dispose | lost
    quantity: integer('quantity').notNull().default(1),
    party: text('party'),
    cost: numeric('cost', { precision: 12, scale: 2 }).default('0'),
    remarks: text('remarks'),
    performedBy: uuid('performed_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('asset_movements_idx').on(t.assetId)],
);
