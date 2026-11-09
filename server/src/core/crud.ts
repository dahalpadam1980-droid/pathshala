import { Router, type Request, type Response, type NextFunction } from 'express';
import { and, asc, desc, eq, getTableColumns, like, or, sql } from 'drizzle-orm';
import type { ZodType } from 'zod';
import { getDb } from '../db/client.js';
import { ApiError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireRole, requireSchool, requireActiveSchool } from '../middleware/auth.js';

type AnyTable = any;

export interface CrudHookContext {
  req: Request<any, any, any, any, any>;
  body?: any;
  id?: string;
  existing?: any;
}

export interface CrudOptions {
  table: AnyTable;
  entity: string;
  /** zod schema for POST body */
  createSchema: ZodType;
  /** zod schema for PATCH body; defaults to createSchema.partial() */
  updateSchema?: ZodType;
  /** text columns searched by ?q= */
  searchFields?: string[];
  /** default sort column (must exist on table) */
  orderBy?: string;
  order?: 'asc' | 'desc';
  /** roles allowed on all operations */
  roles: string[];
  createRoles?: string[];
  updateRoles?: string[];
  deleteRoles?: string[];
  /** scope rows to the caller's school (default true) */
  schoolScoped?: boolean;
  /** allow DELETE (default true) */
  deletable?: boolean;
  /** extra fixed filters applied to list/get (e.g. hide medical data) */
  listFilter?: (req: Request) => any;
  beforeCreate?: (ctx: CrudHookContext) => any | Promise<any>;
  beforeUpdate?: (ctx: CrudHookContext) => any | Promise<any>;
  beforeDelete?: (ctx: CrudHookContext) => Promise<void>;
  afterCreate?: (ctx: CrudHookContext & { row: any }) => Promise<void>;
  afterUpdate?: (ctx: CrudHookContext & { row: any }) => Promise<void>;
  afterDelete?: (ctx: CrudHookContext & { row: any }) => Promise<void>;
}

const RESERVED_PARAMS = new Set(['page', 'pageSize', 'q', 'sort', 'order', 'all', 'format']);

function asyncHandler(
  fn: (req: Request<any, any, any, any, any>, res: Response, next: NextFunction) => unknown,
): (req: Request<any, any, any, any, any>, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function crudRouter(opts: CrudOptions): Router {
  const router = Router();
  const schoolScoped = opts.schoolScoped !== false;
  const deletable = opts.deletable !== false;
  const columns = getTableColumns(opts.table);
  const idColumn = (columns as any).id;
  if (!idColumn) throw new Error(`crudRouter(${opts.entity}): table must have an id column`);

  const guard = schoolScoped
    ? [requireRole(...opts.roles), requireSchool, requireActiveSchool]
    : [requireRole(...opts.roles), requireActiveSchool];

  const resolveScope = (req: Request) => (schoolScoped ? { schoolId: req.auth!.schoolId } : {});

  const assertOwnRow = (req: Request, row: any) => {
    if (schoolScoped && req.auth!.schoolId && row.schoolId && row.schoolId !== req.auth!.schoolId) {
      throw ApiError.notFound();
    }
  };

  // ---------- LIST ----------
  router.get(
    '/',
    ...guard,
    asyncHandler(async (req, res) => {
      const db = await getDb();
      const cols = getTableColumns(opts.table);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));
      const q = (req.query.q as string | undefined)?.trim();
      const sortKey = (req.query.sort as string | undefined) ?? opts.orderBy ?? 'createdAt';
      const order = ((req.query.order as string | undefined) ?? opts.order ?? 'desc') === 'asc' ? 'asc' : 'desc';

      const filters: any[] = [];
      const scope = resolveScope(req);
      if (scope.schoolId) filters.push(eq(cols.schoolId, scope.schoolId));

      // equality filters: any query param matching a column name
      for (const [key, value] of Object.entries(req.query)) {
        if (RESERVED_PARAMS.has(key)) continue;
        if (!(key in cols)) continue;
        if (value === undefined || value === null || value === '') continue;
        filters.push(eq((cols as any)[key], String(value)));
      }

      if (opts.listFilter) {
        const extra = opts.listFilter(req);
        if (extra) filters.push(extra);
      }

      if (q && opts.searchFields?.length) {
        const ors = opts.searchFields
          .filter((f) => f in cols)
          .map((f) => like((cols as any)[f], `%${q}%`));
        if (ors.length) filters.push(or(...ors));
      }

      const where = filters.length ? and(...filters) : undefined;

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(opts.table)
        .where(where);

      const sortCol = (cols as any)[sortKey] ?? cols.createdAt;
      const data = await db
        .select()
        .from(opts.table)
        .where(where)
        .orderBy(order === 'asc' ? asc(sortCol) : desc(sortCol))
        .limit(req.query.all !== undefined ? 1000 : pageSize)
        .offset(req.query.all !== undefined ? 0 : (page - 1) * pageSize);

      res.json({
        ok: true,
        data,
        meta: { page, pageSize, total: count, pages: Math.max(1, Math.ceil(count / pageSize)) },
      });
    }),
  );

  // ---------- GET ONE ----------
  router.get(
    '/:id',
    ...guard,
    asyncHandler(async (req, res) => {
      const db = await getDb();
      const cols = getTableColumns(opts.table);
      const filters: any[] = [eq(cols.id, req.params.id)];
      const scope = resolveScope(req);
      if (scope.schoolId) filters.push(eq(cols.schoolId, scope.schoolId));
      const [row] = await db.select().from(opts.table).where(and(...filters)).limit(1);
      if (!row) throw ApiError.notFound(`${opts.entity} not found`);
      res.json({ ok: true, data: row });
    }),
  );

  // ---------- CREATE ----------
  router.post(
    '/',
    ...(opts.createRoles ? [requireRole(...opts.createRoles), ...(schoolScoped ? [requireSchool] : []), requireActiveSchool] : guard),
    asyncHandler(async (req, res) => {
      const db = await getDb();
      let body: any = opts.createSchema.parse(req.body);
      if (opts.beforeCreate) body = (await opts.beforeCreate({ req, body })) ?? body;
      if (schoolScoped && 'schoolId' in getTableColumns(opts.table)) {
        body = { ...body, schoolId: req.auth!.schoolId };
      }
      const [row] = (await (db.insert(opts.table) as any).values(body).returning()) as any[];
      await audit(db, {
        schoolId: req.auth!.schoolId,
        userId: req.auth!.id,
        action: 'create',
        entity: opts.entity,
        entityId: row.id,
        detail: sanitizeForAudit(body),
        ip: req.ip,
      });
      if (opts.afterCreate) await opts.afterCreate({ req, body, row });
      res.status(201).json({ ok: true, data: row });
    }),
  );

  // ---------- UPDATE ----------
  router.patch(
    '/:id',
    ...(opts.updateRoles ? [requireRole(...opts.updateRoles), ...(schoolScoped ? [requireSchool] : []), requireActiveSchool] : guard),
    asyncHandler(async (req, res) => {
      const db = await getDb();
      const cols = getTableColumns(opts.table);
      const findFilters: any[] = [eq(cols.id, req.params.id)];
      const scope = resolveScope(req);
      if (scope.schoolId) findFilters.push(eq(cols.schoolId, scope.schoolId));
      const [existing] = await db.select().from(opts.table).where(and(...findFilters)).limit(1);
      if (!existing) throw ApiError.notFound(`${opts.entity} not found`);

      const schema: ZodType = opts.updateSchema ?? (opts.createSchema as any).partial?.() ?? opts.createSchema;
      let body: any = schema.parse(req.body);
      delete body.id;
      delete body.schoolId;
      if (opts.beforeUpdate) body = (await opts.beforeUpdate({ req, body, id: req.params.id, existing })) ?? body;
      if (!Object.keys(body).length) {
        return res.json({ ok: true, data: existing });
      }
      const [row] = await db
        .update(opts.table)
        .set({ ...body, updatedAt: new Date() } as any)
        .where(eq(cols.id, req.params.id))
        .returning();
      await audit(db, {
        schoolId: req.auth!.schoolId,
        userId: req.auth!.id,
        action: 'update',
        entity: opts.entity,
        entityId: row.id,
        detail: sanitizeForAudit(body),
        ip: req.ip,
      });
      if (opts.afterUpdate) await opts.afterUpdate({ req, body, id: req.params.id, existing, row });
      res.json({ ok: true, data: row });
    }),
  );

  // ---------- DELETE ----------
  if (deletable) {
    router.delete(
      '/:id',
      ...(opts.deleteRoles ? [requireRole(...opts.deleteRoles), ...(schoolScoped ? [requireSchool] : []), requireActiveSchool] : guard),
      asyncHandler(async (req, res) => {
        const db = await getDb();
        const cols = getTableColumns(opts.table);
        const findFilters: any[] = [eq(cols.id, req.params.id)];
        const scope = resolveScope(req);
        if (scope.schoolId) findFilters.push(eq(cols.schoolId, scope.schoolId));
        const [existing] = await db.select().from(opts.table).where(and(...findFilters)).limit(1);
        if (!existing) throw ApiError.notFound(`${opts.entity} not found`);
        if (opts.beforeDelete) await opts.beforeDelete({ req, id: req.params.id, existing });
        await db.delete(opts.table).where(eq(cols.id, req.params.id));
        await audit(db, {
          schoolId: req.auth!.schoolId,
          userId: req.auth!.id,
          action: 'delete',
          entity: opts.entity,
          entityId: req.params.id,
          detail: sanitizeForAudit(existing),
          ip: req.ip,
        });
        if (opts.afterDelete) await opts.afterDelete({ req, id: req.params.id, row: existing });
        res.json({ ok: true, data: { id: req.params.id, deleted: true } });
      }),
    );
  }

  return router;
}

/** Strip oversized fields from audit payloads. */
function sanitizeForAudit(obj: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === undefined) continue;
    if (typeof v === 'string' && v.length > 500) out[k] = `${v.slice(0, 500)}…`;
    else if (v !== null && typeof v === 'object') out[k] = '[object]';
    else out[k] = v;
  }
  return out;
}
