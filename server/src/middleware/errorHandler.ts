import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/errors.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ ok: false, error: { code: 'not_found', message: `No API route for ${req.method} ${req.path}` } });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  // Drizzle wraps pg errors: look at both the error and its cause
  const cause = err?.cause ?? err;
  const pgCode = err?.code ?? cause?.code;
  const pgMessage = String(cause?.message ?? err?.message ?? '');
  // Malformed uuid in a route param (e.g. GET /staff/employees matched /:id)
  if (pgCode === '22P02' || pgMessage.includes('invalid input syntax for type uuid')) {
    return res.status(404).json({
      ok: false,
      error: { code: 'not_found', message: 'Record not found (invalid id)' },
    });
  }
  // Impossible calendar date (e.g. 2026-11-31) leaking into a query
  if (pgCode === '22008' || pgMessage.includes('date/time field value out of range')) {
    return res.status(400).json({
      ok: false,
      error: { code: 'bad_request', message: 'Invalid date value in request' },
    });
  }
  // Drizzle/pg unique violation
  if (pgCode === '23505' || pgMessage.includes('duplicate key')) {
    return res.status(409).json({
      ok: false,
      error: { code: 'conflict', message: 'A record with these details already exists' },
    });
  }
  if (pgCode === '23503') {
    return res.status(409).json({
      ok: false,
      error: { code: 'conflict', message: 'This record is referenced by other data and cannot be removed' },
    });
  }
  console.error('[error]', err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    ok: false,
    error: {
      code: 'internal_error',
      message: isProd ? 'Something went wrong on the server' : (err?.message ?? 'Internal error'),
      ...(isProd ? {} : { stack: err?.stack?.split('\n').slice(0, 5) }),
    },
  });
}
