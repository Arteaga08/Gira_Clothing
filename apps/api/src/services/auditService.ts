import type { Types } from "mongoose";
import type { AuditAction, AuditModule, ApiMeta } from "@gira/shared";
import { AuditLog } from "../models/AuditLog.js";
import { logger } from "../config/logger.js";
import { parseListQuery, buildMeta, type ListQueryConfig, type RawListQuery } from "../utils/parseListQuery.js";
import { parseStatsRange } from "../utils/parseStatsRange.js";

/**
 * Append-only audit recorder (BACKEND_SECURITY_GUIDELINES §10). Best-effort:
 * a failure is logged but NEVER propagates — it must not roll back or block the
 * operation being audited. Never pass PII or secrets in before/after.
 */

interface AuditEntry {
  actorId?: Types.ObjectId | undefined;
  actorType: "user" | "system";
  action: AuditAction;
  module: AuditModule;
  targetId?: string | undefined;
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
  ip?: string | undefined;
}

const recordAudit = async (entry: AuditEntry): Promise<void> => {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    logger.error({ err, action: entry.action }, "No se pudo registrar auditoría");
  }
};

/**
 * Read side of the audit trail. Append-only stays append-only: this module
 * exposes create + read, and NOTHING that updates or deletes an entry.
 *
 * Entries are returned as stored. `before`/`after` never carry PII by contract
 * (§10), so no extra redaction layer is needed here — the discipline lives at
 * write time, where it belongs.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "action", "module"],
  searchable: ["targetId"],
  defaultSort: "-createdAt",
};

interface AuditLogListQuery extends RawListQuery {
  module?: AuditModule;
  action?: AuditAction;
  actorId?: string;
  days?: unknown;
}

interface PublicAuditLog {
  id: string;
  actorId?: string;
  actorType: "user" | "system";
  action: AuditAction;
  module: AuditModule;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const listAuditLogs = async (
  query: AuditLogListQuery,
): Promise<{ items: PublicAuditLog[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.module) filters.module = query.module;
  if (query.action) filters.action = query.action;
  if (query.actorId) filters.actorId = query.actorId;
  if (query.days !== undefined) {
    const { from } = parseStatsRange({ days: query.days }, 30);
    filters.createdAt = { $gte: from };
  }

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    AuditLog.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items: docs.map((doc) => ({
      id: String(doc._id),
      ...(doc.actorId ? { actorId: String(doc.actorId) } : {}),
      actorType: doc.actorType,
      action: doc.action,
      module: doc.module,
      ...(doc.targetId ? { targetId: doc.targetId } : {}),
      ...(doc.before ? { before: doc.before } : {}),
      ...(doc.after ? { after: doc.after } : {}),
      ...(doc.ip ? { ip: doc.ip } : {}),
      createdAt: doc.createdAt,
    })),
    meta: buildMeta(total, { page, limit }),
  };
};

export type { AuditEntry, AuditLogListQuery, PublicAuditLog };
export { recordAudit, listAuditLogs };
