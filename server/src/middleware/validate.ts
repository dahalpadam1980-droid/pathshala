import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../lib/errors.js';

/** Loose handler typing keeps Express route generics unconstrained. */
type LooseHandler = RequestHandler<any, any, any, any, any>;

function formatIssues(err: any): string {
  if (err?.issues?.length) {
    return err.issues.map((i: any) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');
  }
  return 'Invalid request payload';
}

/** Validate req.body against a zod schema; parsed data replaces req.body. */
export function validateBody(schema: ZodType): LooseHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(ApiError.badRequest(formatIssues(result.error), result.error.issues));
    req.body = result.data;
    next();
  };
}

/** Validate req.query against a zod schema; parsed query replaces req.query. */
export function validateQuery(schema: ZodType): LooseHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(ApiError.badRequest(formatIssues(result.error), result.error.issues));
    (req as any).query = result.data;
    next();
  };
}

/** Parse params with zod and attach to req.params (merged). */
export function validateParams(schema: ZodType): LooseHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(ApiError.badRequest(formatIssues(result.error)));
    Object.assign(req.params, result.data);
    next();
  };
}
