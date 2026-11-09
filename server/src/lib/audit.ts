import type { AppDatabase } from '../db/client.js';

export interface AuditEntry {
  schoolId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: Record<string, unknown>;
  ip?: string | null;
}

/** Append an audit log entry. Never throws — auditing must not break the request. */
export async function audit(db: AppDatabase, entry: AuditEntry): Promise<void> {
  try {
    const { auditLogs } = await import('../db/schema/index.js');
    await db.insert(auditLogs).values({
      schoolId: entry.schoolId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      detail: entry.detail ?? {},
      ip: entry.ip ?? null,
    });
  } catch (err) {
    console.error('[audit] failed to write audit log', err);
  }
}
